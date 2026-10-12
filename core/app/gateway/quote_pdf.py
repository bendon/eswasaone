"""Generate certification quotation PDFs and store them in MediaStore (S3)."""

from __future__ import annotations

import io
import logging
from typing import Any

from app.media.store import MediaStore, get_media_store

logger = logging.getLogger(__name__)


def render_pdf(quote: dict[str, Any], *, application_id: str | None = None) -> bytes:
    """Render a branded quotation PDF with ReportLab (no system deps)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Quotation {quote.get('id') or ''}",
    )
    styles = getSampleStyleSheet()
    brand = colors.HexColor("#0b3d2e")
    gold = colors.HexColor("#c5a24a")
    muted = colors.HexColor("#555555")

    h_brand = ParagraphStyle(
        "Brand",
        parent=styles["Normal"],
        fontSize=9,
        textColor=brand,
        alignment=1,
        spaceAfter=2,
        fontName="Helvetica",
    )
    h_title = ParagraphStyle(
        "QTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=brand,
        alignment=1,
        spaceAfter=4,
        fontName="Times-Bold",
    )
    h_sub = ParagraphStyle(
        "QSub",
        parent=styles["Normal"],
        fontSize=10,
        textColor=muted,
        alignment=1,
        spaceAfter=12,
    )
    body = ParagraphStyle("QBody", parent=styles["Normal"], fontSize=10, leading=14)
    label = ParagraphStyle("QLabel", parent=styles["Normal"], fontSize=8, textColor=muted)

    qid = str(quote.get("id") or "")
    app = str(application_id or quote.get("application_id") or "—")
    org = str(quote.get("org") or "")
    contact = str(quote.get("contact") or org)
    email = str(quote.get("contact_email") or "")
    standards = str(quote.get("standards") or "—")
    scope = str(quote.get("scope") or "—")
    valid = str(quote.get("valid_until") or "—")
    issued = str(quote.get("issued_at") or quote.get("requested_at") or "—")
    total = float(quote.get("total") or 0)
    lines = quote.get("lines") or []

    story: list[Any] = [
        Paragraph("ESWATINI STANDARDS AUTHORITY", h_brand),
        Paragraph("Certification Quotation", h_title),
        Paragraph("ISO/IEC 17021 / 17065 certification body", h_sub),
        Spacer(1, 6),
    ]

    meta = [
        ["Quote", qid],
        ["Application", app],
        ["Issued", issued],
        ["Valid until", valid],
    ]
    meta_t = Table(meta, colWidths=[35 * mm, 130 * mm])
    meta_t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), muted),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
        )
    )
    story.append(meta_t)
    story.append(Spacer(1, 10))
    story.append(Paragraph("Prepared for", label))
    story.append(Paragraph(org or contact, ParagraphStyle("Org", parent=body, fontSize=14, fontName="Helvetica-Bold")))
    story.append(Paragraph(f"{contact} · {email}", body))
    story.append(Spacer(1, 10))

    scope_data = [
        [Paragraph("<b>STANDARD / SCHEME</b>", label)],
        [Paragraph(standards, body)],
        [Paragraph("<b>SCOPE</b>", label)],
        [Paragraph(scope.replace("\n", "<br/>"), body)],
    ]
    scope_t = Table(scope_data, colWidths=[165 * mm])
    scope_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f5ef")),
                ("BOX", (0, 0), (-1, -1), 0, colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LINEBEFORE", (0, 0), (0, -1), 3, gold),
            ]
        )
    )
    story.append(scope_t)
    story.append(Spacer(1, 14))

    fee_rows: list[list[Any]] = [
        [
            Paragraph("<b>Description</b>", body),
            Paragraph("<b>Amount</b>", body),
        ]
    ]
    for ln in lines:
        label_txt = str(ln.get("label") if isinstance(ln, dict) else ln)
        amount = float((ln.get("amount") if isinstance(ln, dict) else 0) or 0)
        fee_rows.append([Paragraph(label_txt, body), Paragraph(f"SZL {amount:,.2f}", body)])
    fee_rows.append(
        [
            Paragraph("<b>Total (excl. surveillance)</b>", body),
            Paragraph(f"<b>SZL {total:,.2f}</b>", body),
        ]
    )
    fee_t = Table(fee_rows, colWidths=[120 * mm, 45 * mm])
    fee_t.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, 0), 1.5, brand),
                ("LINEBELOW", (0, 1), (-1, -2), 0.4, colors.HexColor("#e8e4d9")),
                ("LINEABOVE", (0, -1), (-1, -1), 1, brand),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(fee_t)
    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            "This quotation is issued by ESWASA for certification services. "
            "Acceptance, contract and payment are arranged with the certification desk. "
            "Track your application on the EswasaOne service portal. Prices are in Lilangeni (SZL) "
            "unless otherwise stated.",
            ParagraphStyle("Foot", parent=body, fontSize=8, textColor=muted, leading=11),
        )
    )
    doc.build(story)
    return buf.getvalue()


def store_quote_pdf(
    quote: dict[str, Any],
    *,
    store: MediaStore | None = None,
    application_id: str | None = None,
) -> dict[str, Any]:
    """Render + upload. Returns media key/url/size."""
    media = store or get_media_store()
    qid = str(quote.get("id") or "quote")
    app = application_id or quote.get("application_id")
    pdf = render_pdf(quote, application_id=str(app) if app else None)
    filename = f"{qid.replace('/', '_')}.pdf"
    stored = media.put_bytes(
        pdf,
        filename=filename,
        content_type="application/pdf",
        prefix="quotes",
    )
    # Always expose via Core /api/media so citizens use their session
    # (S3 bucket objects are private; public endpoint URLs 403).
    portal_url = f"/api/media/{stored.key}"
    return {
        "media_key": stored.key,
        "pdf_url": portal_url,
        "s3_url": stored.url,
        "backend": stored.backend,
        "size": stored.size,
        "bucket": stored.bucket,
    }
