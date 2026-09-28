from celery import shared_task
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import TenantSubscription
from .services import iso_now, list_children, normalize_phone, ref, send_sms_message, send_whatsapp_message, set_customer_enabled, upsert_customer_access, write_audit_log

"""

"""
@shared_task
def expire_tenant_subscriptions():
    now = timezone.now()
    expired = TenantSubscription.objects.select_related("tenant").filter(expires_at__lt=now).exclude(tenant__status="suspended")
    count = 0
    for subscription in expired:
        subscription.tenant.status = "suspended"
        subscription.tenant.save(update_fields=["status", "updated_at"])
        ref(f"tenants/{subscription.tenant_id}").update(
            {
                "status": "suspended",
                "suspended_reason": "expired_subscription",
                "subscription_expired_at": subscription.expires_at.isoformat() if subscription.expires_at else "",
                "updated_at": iso_now(),
            }
        )
        write_audit_log(action="AUTO_SUSPEND_EXPIRED_SUBSCRIPTION", target_id=str(subscription.tenant_id), target_type="tenant", metadata={"subscription_id": subscription.pk})
        count += 1
    return count


@shared_task
def send_subscription_reminder_sms():
    now = timezone.now()
    soon = now + timezone.timedelta(days=3)
    return TenantSubscription.objects.filter(expires_at__date=soon.date()).count()


@shared_task
def expire_customer_access():
    now = iso_now()
    count = 0
    for tenant in list_children("tenants"):
        tenant_id = tenant.get("id")
        if not tenant_id:
            continue
        for customer in list_children(f"tenants/{tenant_id}/customers"):
            expiry = str(customer.get("expiry_date") or "")
            if not expiry or expiry > now or customer.get("status") == "expired":
                continue
            service_type = customer.get("service_type") or "hotspot"
            username = customer.get("mac_address") if service_type == "tv" else customer.get("username")
            if service_type == "static":
                try:
                    upsert_customer_access({"id": tenant_id, **tenant}, customer, disabled=True)
                except Exception:
                    pass
            elif service_type != "pppoe":
                try:
                    set_customer_enabled({"id": tenant_id, **tenant}, username, service_type, False)
                except Exception:
                    pass
            ref(f"tenants/{tenant_id}/customers/{customer['id']}").update(
                {
                    "status": "expired",
                    "auto_reconnect": False,
                    "expired_at": now,
                    "updated_at": now,
                }
            )
            count += 1
    return count


@shared_task
def notify_router_offline():
    """Alert each tenant once when a linked MikroTik stops checking in."""
    now = timezone.now()
    threshold = now - timezone.timedelta(minutes=10)
    alerted = 0
    recovered = 0
    for tenant in list_children("tenants"):
        tenant_id = tenant.get("id")
        if not tenant_id:
            continue
        linked = bool(
            tenant.get("mikrotik_last_seen_at")
            or tenant.get("mikrotik_router_snapshot")
            or tenant.get("mikrotik_provisioning_status") in {"script_downloaded", "completed"}
        )
        if not linked:
            continue
        last_seen = parse_datetime(str(tenant.get("mikrotik_last_seen_at") or ""))
        if last_seen and timezone.is_naive(last_seen):
            last_seen = timezone.make_aware(last_seen, timezone.get_current_timezone())
        offline = not last_seen or last_seen <= threshold
        challenge_path = f"tenants/{tenant_id}"
        if not offline:
            if tenant.get("router_offline_notified_at"):
                ref(challenge_path).update({"router_offline_notified_at": "", "router_recovered_at": iso_now()})
                recovered += 1
            continue
        if tenant.get("router_offline_notified_at"):
            continue
        phone = normalize_phone(tenant.get("phone") or tenant.get("support_phone"))
        if not phone:
            continue
        last_seen_text = last_seen.isoformat() if last_seen else "never"
        message = (
            f"{tenant.get('business_name') or 'Expressnet'} alert: your linked MikroTik router appears offline. "
            f"Last check-in: {last_seen_text}. Please check power and internet connectivity."
        )
        results = []
        whatsapp = send_whatsapp_message(phone, message, tenant)
        if whatsapp.get("sent"):
            results.append("whatsapp")
        sms = send_sms_message(phone, message, tenant)
        if sms.get("sent"):
            results.append("sms")
        if results:
            ref(challenge_path).update({"router_offline_notified_at": iso_now(), "router_offline_notification_channels": results})
            alerted += 1
    return {"alerted": alerted, "recovered": recovered}
