"""
Notification Service for alert delivery.

Supports email (via aiosmtplib) and webhook notifications (via httpx).
"""

import asyncio
import os
import logging
from typing import Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import httpx

logger = logging.getLogger(__name__)

# SMTP Configuration from environment
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


def is_smtp_configured() -> bool:
    """Check if SMTP is properly configured."""
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS and SMTP_FROM)


async def send_email_notification(
    to: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None
) -> bool:
    """
    Send an email notification asynchronously.

    Args:
        to: Recipient email address
        subject: Email subject line
        body: Plain text body
        html_body: Optional HTML body for rich formatting

    Returns:
        True if sent successfully, False otherwise
    """
    if not is_smtp_configured():
        logger.warning(
            "SMTP not configured - skipping email notification. "
            "Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM environment variables."
        )
        return False

    if not to:
        logger.warning("No recipient email provided - skipping notification")
        return False

    try:
        import aiosmtplib

        # Build message
        if html_body:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
        else:
            msg = MIMEText(body, "plain")

        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to

        # Send via SMTP
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            start_tls=SMTP_USE_TLS,
        )

        logger.info(f"Email notification sent to {to}: {subject}")
        return True

    except ImportError:
        logger.error("aiosmtplib not installed - cannot send email")
        return False
    except Exception as e:
        logger.error(f"Failed to send email notification to {to}: {e}")
        return False


async def send_alert_email(
    to: str,
    alert_type: str,
    alert_name: str,
    message: str,
    severity: str = "medium",
    details: Optional[dict] = None
) -> bool:
    """
    Send a formatted alert notification email.

    Args:
        to: Recipient email address
        alert_type: Type of alert (e.g., "occupancy", "loitering")
        alert_name: Name of the alert configuration
        message: Alert message
        severity: Alert severity level
        details: Optional additional details dict

    Returns:
        True if sent successfully, False otherwise
    """
    subject = f"[{severity.upper()}] Alert: {alert_name}"

    # Plain text body
    body = f"""
Analytics Dashboard Alert

Type: {alert_type}
Name: {alert_name}
Severity: {severity}

Message:
{message}
"""

    if details:
        body += "\nDetails:\n"
        for key, value in details.items():
            body += f"  - {key}: {value}\n"

    body += f"\n--\nThis is an automated message from Analytics Dashboard."

    # HTML body for nicer formatting
    severity_color = {
        "low": "#17a2b8",
        "medium": "#ffc107",
        "high": "#fd7e14",
        "critical": "#dc3545"
    }.get(severity.lower(), "#6c757d")

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .header {{ background: {severity_color}; color: white; padding: 15px; border-radius: 5px 5px 0 0; }}
        .content {{ padding: 20px; background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; }}
        .label {{ font-weight: bold; color: #495057; }}
        .message {{ background: white; padding: 15px; border-left: 4px solid {severity_color}; margin: 15px 0; }}
        .footer {{ font-size: 12px; color: #6c757d; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="header">
        <h2 style="margin:0;">⚠️ {alert_name}</h2>
        <small>Severity: {severity.upper()}</small>
    </div>
    <div class="content">
        <p><span class="label">Alert Type:</span> {alert_type}</p>
        <div class="message">{message}</div>
"""

    if details:
        html_body += "<p><span class='label'>Details:</span></p><ul>"
        for key, value in details.items():
            html_body += f"<li><strong>{key}:</strong> {value}</li>"
        html_body += "</ul>"

    html_body += """
        <div class="footer">
            This is an automated message from Analytics Dashboard.
        </div>
    </div>
</body>
</html>
"""

    return await send_email_notification(to, subject, body, html_body)


async def send_webhook_notification(url: str, payload: dict) -> bool:
    """
    Send a webhook notification with retry and exponential backoff.

    Args:
        url: Webhook URL to POST to
        payload: JSON payload to send

    Returns:
        True if sent successfully, False otherwise
    """
    if not url:
        logger.warning("No webhook URL provided - skipping notification")
        return False

    # Retry configuration: 3 attempts with delays of 1s, 2s, 4s
    max_attempts = 3
    base_delay = 1  # seconds

    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()

            logger.info(f"Webhook notification sent to {url}: status={response.status_code}")
            return True

        except httpx.HTTPStatusError as e:
            logger.warning(
                f"Webhook notification failed (attempt {attempt + 1}/{max_attempts}): "
                f"status={e.response.status_code}, url={url}"
            )
        except httpx.RequestError as e:
            logger.warning(
                f"Webhook request error (attempt {attempt + 1}/{max_attempts}): "
                f"{type(e).__name__}: {e}, url={url}"
            )
        except Exception as e:
            logger.error(f"Unexpected webhook error: {type(e).__name__}: {e}")
            return False

        # Exponential backoff: 1s, 2s, 4s
        if attempt < max_attempts - 1:
            delay = base_delay * (2 ** attempt)
            logger.debug(f"Retrying webhook in {delay}s...")
            await asyncio.sleep(delay)

    logger.error(f"Webhook notification failed after {max_attempts} attempts: {url}")
    return False
