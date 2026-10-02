# Copyright (c) 2026, ESWASA and contributors
# License: MIT

from frappe.model.document import Document

from eswasa_tbt.rules import rt1_notification_ingested, rt1_on_update


class TBTNotification(Document):
    """TBT Notification — R-T1/R-T2 fire on insert/update."""

    def after_insert(self):
        rt1_notification_ingested(self, "after_insert")

    def on_update(self):
        rt1_on_update(self, "on_update")
