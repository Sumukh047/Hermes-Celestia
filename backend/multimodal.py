"""
Hermes Agent Studio - Multimodal Inference & Document Analysis Engine
Supports task-focused Work Modes and deep parsing of PDFs, PPTXs, DOCXs, Spreadsheets, and Images.
"""

import io
import re
import base64
import logging
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image
import pypdf
import pptx
import docx

logger = logging.getLogger("hermes_agent_studio.multimodal")

# ==============================================================================
# Work Modes & System Prompts (Matching Studio Work Modes Matrix)
# ==============================================================================

WORK_MODES: Dict[str, Dict[str, str]] = {
    "general": {
        "title": "General",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are an expert AI assistant operating in General Work Mode.\n"
            "Analyze all user questions, instructions, and attached multimodal files (documents, presentations, spreadsheets, or images) thoroughly.\n"
            "Provide structured, clear, and actionable answers using your task-focused local workflow."
        )
    },
    "draft_approval": {
        "title": "Draft approval note",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are an executive administrative officer operating in Draft Approval Note mode.\n"
            "Your objective is to produce comprehensive, professional administrative notes for approval based on user input and any attached documents.\n"
            "Structure your output strictly as follows:\n"
            "1. SUBJECT / TITLE: Clear, concise subject statement.\n"
            "2. BACKGROUND: Contextual summary of why approval is sought.\n"
            "3. OBSERVATIONS & ANALYSIS: Detailed factual points, citing data from attached files.\n"
            "4. FINANCIAL / RESOURCE IMPLICATIONS: Cost, budget, headcount, or time requirements.\n"
            "5. RISKS & MITIGATION: Key risks and safeguards.\n"
            "6. RECOMMENDATION & PROPOSAL: Specific resolution for executive sanction."
        )
    },
    "official_letter": {
        "title": "Letter / official correspondence",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are an executive correspondence expert operating in Official Letter & Correspondence mode.\n"
            "Draft formal, authoritative, and polished letters, business memoranda, or diplomatic correspondence.\n"
            "Include proper reference numbers, formal salutations, concise thematic paragraphs, professional sign-offs, and appropriate signature blocks."
        )
    },
    "engineering_calc": {
        "title": "Engineering calculation",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are a senior professional engineer operating in Engineering Calculation mode.\n"
            "Deliver rigorous, mathematically sound engineering derivations, structural checks, or technical calculations.\n"
            "Instructions:\n"
            "1. State all given parameters, assumptions, and governing standards/codes.\n"
            "2. Present the governing formula in clean text/LaTeX notation.\n"
            "3. Show step-by-step substitution with explicit SI or imperial units.\n"
            "4. Verify boundary limits, safety factors, and potential failure modes.\n"
            "5. Summarize final calculated values clearly with appropriate significant figures."
        )
    },
    "inspection_review": {
        "title": "Inspection report review",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are a lead quality assurance auditor and safety inspector operating in Inspection Report Review mode.\n"
            "Carefully review the provided inspection reports, logs, or site photographs.\n"
            "Instructions:\n"
            "1. Identify and categorize defects, discrepancies, or non-conformance items.\n"
            "2. Assess risk levels (Critical, Major, Minor) with reference to safety/regulatory compliance.\n"
            "3. Highlight root cause indicators from the provided data.\n"
            "4. Prescribe specific Corrective and Preventive Actions (CAPA) with verification criteria."
        )
    },
    "coding_verification": {
        "title": "Coding & verification",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are a principal software engineer operating in Coding & Verification mode.\n"
            "Write production-grade, secure, performant, and fully typed code.\n"
            "Instructions:\n"
            "1. Provide complete, runnable implementations without placeholders.\n"
            "2. Include error boundaries and edge-case validation.\n"
            "3. Provide comprehensive unit tests verifying correctness.\n"
            "4. Explain time and space computational complexity."
        )
    },
    "document_summary": {
        "title": "Document summarization",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are an intelligence research analyst operating in Document Summarization mode.\n"
            "Read, synthesize, and condense the attached documents (PDFs, reports, presentations, notes) with high fidelity.\n"
            "Structure:\n"
            "- Executive Summary (TL;DR)\n"
            "- Core Findings & Key Arguments (bulleted with page/section references)\n"
            "- Quantitative Data & Metrics\n"
            "- Strategic Implications & Next Steps."
        )
    },
    "knowledge_research": {
        "title": "Knowledge-base research",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are a senior researcher and knowledge architect operating in Knowledge-Base Research mode.\n"
            "Synthesize complex information from user prompts and attached documents into structured knowledge assets.\n"
            "Provide deep context, explain nuances, cross-reference related concepts, and structure findings into reusable reference documentation."
        )
    },
    "presentation_outline": {
        "title": "Presentation outline",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are an executive keynote designer operating in Presentation Outline mode.\n"
            "Transform input topics or documents into a compelling, slide-by-slide presentation deck outline.\n"
            "For each slide, specify:\n"
            "- Slide Number & Title\n"
            "- Visual Layout / Graphic Concept\n"
            "- 3-4 Impactful Talking Points / Content Bullets\n"
            "- Speaker Delivery Notes & Transitions."
        )
    },
    "spreadsheet_analysis": {
        "title": "Spreadsheet analysis",
        "description": "Use a task-focused local workflow",
        "system_prompt": (
            "You are a quantitative data analyst operating in Spreadsheet Analysis mode.\n"
            "Analyze tabular datasets, financial models, CSVs, or spreadsheet tables provided.\n"
            "Instructions:\n"
            "1. Explain data schema, column definitions, and total record counts.\n"
            "2. Identify key trends, statistical aggregates (sums, averages, medians), and anomalies/outliers.\n"
            "3. Recommend Excel/Sheets formula improvements or data transformations.\n"
            "4. Provide actionable commercial or operational conclusions."
        )
    }
}


# ==============================================================================
# Multimodal File Parsing Engine
# ==============================================================================

def parse_attached_file(filename: str, file_b64: str, file_type: str = "") -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Parses an attached file (PDF, PPTX, DOCX, Image, Text/CSV) from base64 into:
    1. Clean extracted text representation for context injection.
    2. Vision payload dictionary if image is supported.
    """
    try:
        # Strip data URL prefix if present
        if "," in file_b64:
            file_b64 = file_b64.split(",", 1)[1]

        file_bytes = base64.b64decode(file_b64)
        ext = filename.lower().split(".")[-1] if "." in filename else file_type.lower()
        size_kb = round(len(file_bytes) / 1024, 1)

        # 1. Images (JPEG, PNG, WEBP, GIF)
        if ext in ("jpg", "jpeg", "png", "webp", "gif"):
            try:
                img = Image.open(io.BytesIO(file_bytes))
                width, height = img.size
                mime = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
                text_meta = f"[Attached Image: '{filename}' | Resolution: {width}x{height}px | Size: {size_kb} KB]"
                vision_payload = {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime};base64,{file_b64}"
                    }
                }
                return text_meta, vision_payload
            except Exception as e:
                return f"[Image '{filename}' could not be decoded: {e}]", None

        # 2. PDF Documents
        elif ext == "pdf":
            try:
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                pages_text = []
                for idx, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    if page_text.strip():
                        pages_text.append(f"--- Page {idx + 1} ---\n{page_text.strip()}")

                full_text = "\n\n".join(pages_text)
                if not full_text.strip():
                    full_text = "(No extractable text found in PDF. It may contain scanned image pages.)"

                formatted = (
                    f"[Attached Document: '{filename}' (PDF, {len(reader.pages)} pages, {size_kb} KB)]\n"
                    f"{full_text[:35000]}\n"
                    f"[End of '{filename}']"
                )
                return formatted, None
            except Exception as e:
                logger.error(f"PDF extraction error for {filename}: {e}")
                return f"[Error extracting PDF '{filename}': {str(e)}]", None

        # 3. PowerPoint Presentations (PPTX)
        elif ext in ("pptx", "ppt"):
            try:
                prs = pptx.Presentation(io.BytesIO(file_bytes))
                slides_text = []
                for idx, slide in enumerate(prs.slides):
                    slide_lines = []
                    for shape in slide.shapes:
                        if hasattr(shape, "text") and shape.text.strip():
                            slide_lines.append(shape.text.strip())
                    if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
                        slide_lines.append(f"Notes: {slide.notes_slide.notes_text_frame.text.strip()}")

                    slides_text.append(f"--- Slide {idx + 1} ---\n" + "\n".join(slide_lines))

                formatted = (
                    f"[Attached Presentation: '{filename}' (PPTX, {len(prs.slides)} slides, {size_kb} KB)]\n"
                    f"{'\n\n'.join(slides_text)[:35000]}\n"
                    f"[End of '{filename}']"
                )
                return formatted, None
            except Exception as e:
                logger.error(f"PPTX extraction error for {filename}: {e}")
                return f"[Error extracting presentation '{filename}': {str(e)}]", None

        # 4. Microsoft Word (DOCX)
        elif ext in ("docx", "doc"):
            try:
                doc = docx.Document(io.BytesIO(file_bytes))
                paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
                tables_text = []
                for t in doc.tables:
                    for row in t.rows:
                        row_vals = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                        if row_vals:
                            tables_text.append(" | ".join(row_vals))

                all_content = "\n\n".join(paras + tables_text)
                formatted = (
                    f"[Attached Document: '{filename}' (Word Document, {size_kb} KB)]\n"
                    f"{all_content[:35000]}\n"
                    f"[End of '{filename}']"
                )
                return formatted, None
            except Exception as e:
                logger.error(f"DOCX extraction error for {filename}: {e}")
                return f"[Error extracting Word document '{filename}': {str(e)}]", None

        # 5. Plain Text, CSV, JSON, Markdown, Code
        else:
            try:
                text_content = file_bytes.decode("utf-8", errors="replace")
                formatted = (
                    f"[Attached File: '{filename}' ({size_kb} KB)]\n"
                    f"{text_content[:35000]}\n"
                    f"[End of '{filename}']"
                )
                return formatted, None
            except Exception as e:
                return f"[Error reading file '{filename}': {str(e)}]", None

    except Exception as e:
        logger.error(f"General file parsing failure for {filename}: {e}")
        return f"[Failed to process file '{filename}': {str(e)}]", None