from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing_api", "0015_static_customer_blank_credentials")]
    operations = [
        migrations.AddField(model_name="payment", name="paystack_reference", field=models.CharField(blank=True, max_length=255, null=True)),
        migrations.AddField(model_name="payment", name="paystack_access_code", field=models.CharField(blank=True, max_length=255, null=True)),
        migrations.AddField(model_name="payment", name="paystack_authorization_url", field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name="payment", name="paystack_transaction_id", field=models.CharField(blank=True, max_length=120, null=True)),
        migrations.AddField(model_name="payment", name="paystack_channel", field=models.CharField(blank=True, max_length=80, null=True)),
        migrations.AddField(model_name="payment", name="paystack_paid_at", field=models.CharField(blank=True, max_length=80, null=True)),
    ]
