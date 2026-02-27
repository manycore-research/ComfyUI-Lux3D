"""
Invitation code parsing tool
According to Confluence documentation: invitation code format is version:ak:sk:appuid, encoded with Base64
ak, sk, appuid consist of uppercase and lowercase letters, underscores, and numbers
"""
import base64
import binascii
import re
import logging

logger = logging.getLogger("LuxRealEngine")

INVITATION_CODE_VERSION = "1"
FIELD_PATTERN = re.compile(r'^[a-zA-Z0-9_]+$')


class InvitationCodeError(Exception):
    """Invitation code parsing error"""
    pass


def validate_field(field_name, field_value):
    """Validate field format: can only contain uppercase and lowercase letters, underscores, and numbers"""
    if not field_value:
        raise InvitationCodeError(f"{field_name} cannot be empty")
    if not FIELD_PATTERN.match(field_value):
        raise InvitationCodeError(
            f"{field_name} can only contain uppercase and lowercase letters, underscores, and numbers, current value: {field_value}"
        )


def parse_invitation_code(invitation_code):
    """
    Parse invitation code, return {version, ak, sk, appuid}.

    Args:
        invitation_code: Base64 encoded invitation code string

    Returns:
        dict: {"version": str, "ak": str, "sk": str, "appuid": str}

    Raises:
        InvitationCodeError: Thrown when parsing fails
    """
    if not invitation_code:
        raise InvitationCodeError("Invitation code cannot be empty")

    invitation_code = invitation_code.strip()

    try:
        decoded_bytes = base64.b64decode(invitation_code)
        raw_string = decoded_bytes.decode('utf-8')
        parts = raw_string.split(':')

        if len(parts) != 4:
            raise InvitationCodeError(
                "Invalid invitation code format: should contain 4 parts (version:ak:sk:appuid)"
            )

        version, ak, sk, appuid = parts

        if version != INVITATION_CODE_VERSION:
            raise InvitationCodeError(
                f"Unsupported invitation code version: {version}, currently supported: {INVITATION_CODE_VERSION}"
            )

        validate_field("ak", ak)
        validate_field("sk", sk)
        validate_field("appuid", appuid)

        return {
            "version": version,
            "ak": ak,
            "sk": sk,
            "appuid": appuid
        }
    except binascii.Error as e:
        raise InvitationCodeError(f"Invitation code Base64 decoding failed: {e}")
    except UnicodeDecodeError as e:
        raise InvitationCodeError(f"Invitation code UTF-8 decoding failed: {e}")
    except Exception as e:
        if isinstance(e, InvitationCodeError):
            raise
        raise InvitationCodeError(f"Invitation code parsing failed: {e}")
