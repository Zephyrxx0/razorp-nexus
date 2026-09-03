import hashlib
from typing import Any


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def compute_canonical_preimage(entry: Any) -> str:
    """Generate canonical pipe-delimited preimage for SHA-256 hash chaining (D-06, D-08).

    Format: prev_entry_hash|transaction_id|step_number|step_name|input_summary|output_summary|reason|is_error
    """
    is_error = _get_val(entry, "is_error", False)
    is_error_str = str(bool(is_error)).lower()

    parts = [
        str(_get_val(entry, "prev_entry_hash", "")),
        str(_get_val(entry, "transaction_id", "")),
        str(_get_val(entry, "step_number", "")),
        str(_get_val(entry, "step_name", "")),
        str(_get_val(entry, "input_summary", "")),
        str(_get_val(entry, "output_summary", "")),
        str(_get_val(entry, "reason", "")),
        is_error_str,
    ]
    return "|".join(parts)


def compute_entry_hash(entry: Any) -> str:
    """Compute SHA-256 entry_hash from canonical preimage string (D-06)."""
    preimage = compute_canonical_preimage(entry)
    return hashlib.sha256(preimage.encode("utf-8")).hexdigest()


def verify_audit_chain(entries: list[Any]) -> bool:
    """Verify cryptographic integrity and continuity of an audit trail (D-08).

    Ensures:
    1. At least 1 entry exists
    2. Step numbers are contiguous integers starting at 1
    3. Step 1 prev_entry_hash is 'GENESIS'
    4. Step N prev_entry_hash matches Step N-1 entry_hash
    5. Every entry_hash matches SHA-256 of its canonical preimage
    """
    if not entries:
        return False

    sorted_entries = sorted(entries, key=lambda x: _get_val(x, "step_number", 0))

    expected_prev = "GENESIS"
    expected_step = 1

    for entry in sorted_entries:
        step_number = _get_val(entry, "step_number")
        prev_entry_hash = _get_val(entry, "prev_entry_hash")
        entry_hash = _get_val(entry, "entry_hash")

        # 1. Verify contiguous step numbering
        if step_number != expected_step:
            return False

        # 2. Verify previous entry hash pointer
        if prev_entry_hash != expected_prev:
            return False

        # 3. Verify cryptographic SHA-256 digest
        computed_hash = compute_entry_hash(entry)
        if entry_hash != computed_hash:
            return False

        expected_prev = entry_hash
        expected_step += 1

    return True
