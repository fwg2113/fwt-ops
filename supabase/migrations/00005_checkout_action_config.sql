-- ============================================================
-- 00005_checkout_action_config.sql
-- Configurable action buttons, checkout flow settings,
-- and message templates on shop_config
-- ============================================================

-- Checkout flow settings (invoice timing, self-checkout gates, payment timing)
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS checkout_flow_config jsonb NOT NULL DEFAULT '{
    "invoice_creation": "manual",
    "self_checkout_availability": "after_invoice",
    "payment_timing": "collect_after",
    "show_self_checkout_qr": true
  }'::jsonb;

-- Configurable action buttons on appointment timeline cards
-- Each button: key, enabled, label, clickedLabel, defaultColor, clickedColor,
-- behavior, statusTarget, messageTemplate, showWhen
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS action_buttons_config jsonb NOT NULL DEFAULT '{
    "buttons": [
      {
        "key": "edit",
        "enabled": true,
        "label": "Edit",
        "clickedLabel": "Edit",
        "defaultColor": "#6b7280",
        "clickedColor": "#6b7280",
        "behavior": "edit_modal",
        "statusTarget": null,
        "messageTemplate": null,
        "showWhen": null
      },
      {
        "key": "headsup",
        "enabled": true,
        "label": "Send Heads-Up",
        "clickedLabel": "Sent",
        "defaultColor": "#f59e0b",
        "clickedColor": "#22c55e",
        "behavior": "headsup_send",
        "statusTarget": null,
        "messageTemplate": null,
        "showWhen": { "appointment_type_in": ["headsup_30", "headsup_60"] }
      },
      {
        "key": "checkin",
        "enabled": true,
        "label": "Check In",
        "clickedLabel": "Checked In",
        "defaultColor": "#6b7280",
        "clickedColor": "#22c55e",
        "behavior": "status_change",
        "statusTarget": "in_progress",
        "messageTemplate": null,
        "showWhen": { "status_in": ["booked"] }
      },
      {
        "key": "undo_checkin",
        "enabled": true,
        "label": "Undo",
        "clickedLabel": "Undo",
        "defaultColor": "#6b7280",
        "clickedColor": "#6b7280",
        "behavior": "status_change",
        "statusTarget": "booked",
        "messageTemplate": null,
        "showWhen": { "status_in": ["in_progress"] }
      },
      {
        "key": "message",
        "enabled": true,
        "label": "Message",
        "clickedLabel": "Messaged",
        "defaultColor": "#3b82f6",
        "clickedColor": "#22c55e",
        "behavior": "message_modal",
        "statusTarget": null,
        "messageTemplate": "vehicle_ready",
        "showWhen": null
      },
      {
        "key": "invoice",
        "enabled": true,
        "label": "Invoice",
        "clickedLabel": "Invoiced",
        "defaultColor": "#eab308",
        "clickedColor": "#22c55e",
        "behavior": "invoice_modal",
        "statusTarget": null,
        "messageTemplate": null,
        "showWhen": null
      }
    ]
  }'::jsonb;

-- Named message templates with variable placeholders
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS message_templates jsonb NOT NULL DEFAULT '{
    "vehicle_ready": "Hi {customer_first_name}, your {vehicle_year} {vehicle_make} {vehicle_model} is ready for pickup at {shop_name}!",
    "vehicle_received": "Hi {customer_first_name}, we''ve received your {vehicle_year} {vehicle_make} {vehicle_model} at {shop_name}. We''ll let you know when it''s ready!",
    "invoice_sent": "Hi {customer_first_name}, your invoice for your {vehicle_year} {vehicle_make} {vehicle_model} is ready. View and pay here: {invoice_link}"
  }'::jsonb;
