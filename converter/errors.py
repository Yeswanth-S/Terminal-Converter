class ConversionError(Exception):
    """Safe, user-facing errors shown directly in the UI without leaking stack traces."""
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Cancelled(Exception):
    """Raised on user cancellation to allow a neutral 'cancelled' status instead of 'failed'."""
    pass