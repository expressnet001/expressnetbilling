import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing_api", "0016_paystack_checkout")]

    operations = [
        migrations.CreateModel(
            name="PaystackWithdrawal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("fee", models.DecimalField(decimal_places=2, default=80, max_digits=10)),
                ("currency", models.CharField(default="KES", max_length=10)),
                ("payout_method", models.CharField(max_length=24)),
                ("destination_label", models.CharField(blank=True, default="", max_length=180)),
                ("recipient_code", models.CharField(blank=True, default="", max_length=80)),
                ("reference", models.CharField(max_length=64, unique=True)),
                ("transfer_code", models.CharField(blank=True, default="", max_length=100)),
                ("status", models.CharField(default="initiating", max_length=24)),
                ("failure_reason", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="paystack_withdrawals", to="billing_api.tenant")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
