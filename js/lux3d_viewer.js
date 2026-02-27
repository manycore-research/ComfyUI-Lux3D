import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"; // Import api for WebSocket message listening

const LUX_NODE_MIN_WIDTH = 300;
const LUX_NODE_MIN_HEIGHT = 300;

app.registerExtension({
    name: "Lux.LuxRealEngine",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LuxRealEngine") {
            // 1. Hide _upload_cache widget after node creation
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
                
                // Hide _upload_cache widget as users don't need to see it
                const cacheWidget = this.widgets?.find(w => w.name === "_upload_cache");
                if (cacheWidget) {
                    // Standard way to hide widget
                    Object.defineProperty(cacheWidget, "hidden", { value: true });
                    // Make widget take no space
                    cacheWidget.computeSize = () => [0, -4];
                    // Disable drawing
                    cacheWidget.draw = function() {};
                }
                // Node minimum size 300x300: Override setSize to ensure all size setting paths respect minimum values
                const origSetSize = this.setSize;
                if (origSetSize) {
                    this.setSize = function(size) {
                        if (size && size.length >= 2) {
                            size = [Math.max(size[0], LUX_NODE_MIN_WIDTH), Math.max(size[1], LUX_NODE_MIN_HEIGHT)];
                        }
                        return origSetSize.call(this, size);
                    };
                }
                // Set minimum size at creation to avoid node size jumps after first iframe load
                const sz = this.size || [0, 0];
                this.setSize([Math.max(sz[0], LUX_NODE_MIN_WIDTH), Math.max(sz[1], LUX_NODE_MIN_HEIGHT)]);
            };

            // 2. Initialize listener
            const originalOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(info) {
                if (originalOnConfigure) originalOnConfigure.apply(this, arguments);

                // Listen for 'lux-real-engine-iframe-update' events sent by Python
                // This event triggers before rendering starts
                api.addEventListener("lux-real-engine-iframe-update", (event) => {
                    const data = event.detail;
                    // Ensure message is sent to current node
                    if (data && data.node === this.id + "") {
                        if (data.iframe_url) {
                            this.updateWidget(data.iframe_url);
                        }
                        // Save SSO token for iframe inner page to send back during login request after loading
                        this._sso_token = data.sso_token || null;
                    }
                });
            };

            // 3. Callback after rendering completion (standard process)
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                if (message && message.iframe_url) {
                    this.updateWidget(message.iframe_url[0]);
                }
                if (message && message.sso_token !== undefined) {
                    this._sso_token = message.sso_token || null;
                }

                // [Upload cache] Update _upload_cache widget value
                // ComfyUI automatically serializes widget values and passes them to backend on next execution
                if (message && message._upload_cache && message._upload_cache[0]) {
                    const cacheWidget = this.widgets?.find(w => w.name === "_upload_cache");
                    if (cacheWidget) {
                        cacheWidget.value = message._upload_cache[0];
                    }
                }
            };

            // 3. Core function to update Widget
            nodeType.prototype.updateWidget = function (url) {
                const widgetName = "preview_iframe";
                let widget = this.widgets?.find((w) => w.name === widgetName);

                // [Core optimization]: Prevent refresh when URL unchanged
                // Use _last_iframe_url variable to record, more accurate than reading DOM src
                if (this._last_iframe_url === url) {
                    return; // Same URL, exit directly, do nothing
                }

                // Update cached URL
                this._last_iframe_url = url;

                if (!widget) {
                    // --- Create DOM container (refer to load3d / ComfyUI DOM widget adaptive node size) ---
                    const container = document.createElement("div");
                    container.style.width = "100%";
                    container.style.height = "100%";
                    container.style.minHeight = LUX_NODE_MIN_HEIGHT + "px";
                    container.style.backgroundColor = "#222";
                    container.style.display = "flex";
                    container.style.boxSizing = "border-box";

                    const iframe = document.createElement("iframe");
                    iframe.style.width = "100%";
                    iframe.style.height = "100%";
                    iframe.style.border = "none";
                    iframe.style.flex = "1";
                    iframe.style.minHeight = "0"; // Allow flex child items to shrink
                    // Grant iframe necessary permissions
                    iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; clipboard-write";
                    iframe.src = url;

                    container.appendChild(iframe);

                    // Add Widget: Use getHeight/getMinHeight to make iframe adapt to node size (don't set computeSize)
                    widget = this.addDOMWidget(widgetName, "iframe_view", container, {
                        serialize: false,
                        hideOnZoom: false,
                        getMinHeight: () => LUX_NODE_MIN_HEIGHT,
                        getHeight: () => "100%"
                    });
                } else {
                    // --- Update existing iframe ---
                    const iframe = widget.element.querySelector("iframe");
                    if (iframe) {
                        iframe.src = url;
                    }
                }

                // Only apply minimum restrictions based on current size and refresh layout, don't call computeSize first to avoid rewriting size causing node secondary jumps
                const currentWidth = Math.max(this.size[0], LUX_NODE_MIN_WIDTH);
                const desiredHeight = Math.max((this.size && this.size[1]) || 0, LUX_NODE_MIN_HEIGHT);
                this.setSize([currentWidth, desiredHeight]);

                app.graph.setDirtyCanvas(true);
            };

            window.addEventListener("message", (event) => {
                const messageData = event.data;
                if (messageData.type === "initialized" && event.origin.includes('luxreal')) {
                    // Send token to iframe
                    const iframeWin = event.source;
                    const graph = app.graph;
                    if (graph?._nodes) {
                        for (const nodeId in graph._nodes) {
                            const node = graph._nodes[nodeId];
                            if (node.type !== "LuxRealEngine" || !node.widgets) continue;
                            const w = node.widgets.find((w) => w.name === "preview_iframe");
                            if (!w?.element) continue;
                            const iframe = w.element.querySelector("iframe");
                            if (!iframe || iframe.contentWindow !== iframeWin) continue;
                            const token = node._sso_token;
                            if (token) {
                                iframeWin.postMessage({ type: "loginToken", data: token }, "*");
                            }
                            return;
                        }
                    }
                }
            });
        }
    },
});