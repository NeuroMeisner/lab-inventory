WELCOME = (
    "👋 Welcome to the Lab Inventory bot!\n\n"
    "I can search reagents, reserve packages and send you notifications "
    "(low stock, expiry, placement).\n\n"
    "To start, link your account:\n"
    "1. Open the PWA web app → Home → 'Link Telegram'\n"
    "2. Generate the 6-digit code\n"
    "3. Send it here: /link 123456"
)

HELP = (
    "Available commands:\n"
    "/start — welcome & linking instructions\n"
    "/link <code> — link Telegram to your PWA account (6-digit code)\n"
    "/search <name> — quick search, e.g. /search acetone\n"
    "/mypackages — packages I opened\n"
    "/pending — items waiting for placement\n"
    "/help — this help"
)

NOT_LINKED = (
    "❗ Your Telegram account is not linked yet.\n"
    "Open the PWA → Home → 'Link Telegram', generate a code and send: /link 123456"
)

LINK_USAGE = "Usage: /link 123456 (6-digit code from the PWA 'Link Telegram' page)"
LINK_OK = "✅ Accounts linked. Welcome, {name}!"
SEARCH_USAGE = "Usage: /search acetone"
SEARCH_EMPTY = "🔍 Nothing found for '{q}'."

RESERVE_OK = (
    "✅ Package {code} is reserved for you for 30 minutes (until {until}).\n"
    "Other users will see the reservation warning."
)
RESERVE_CONFLICT = "😕 This package is already reserved by another user."
UNRESERVE_OK = "✅ Reservation cancelled."

MY_EMPTY = "You have no opened packages in the last 30 days."
PENDING_EMPTY = "🎉 No items are waiting for placement."

BTN_WRITE_OFF_WEB = "📝 Write off via web"
BTN_OPEN_PWA = "🌐 Open in PWA"
BTN_RESERVE = "🔒 Going to take it"
BTN_CANCEL_RESERVE = "❌ Cancel reservation"
BTN_PLACE_PWA = "📍 Place in PWA"

DEEP_LINK_MSG = "Here is your link to write off {code}:"
UNKNOWN = "I don't understand. Use /help to see available commands."
BACKEND_ERROR = "⚠️ Backend error ({status}): {detail}"