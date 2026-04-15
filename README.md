# MapleStory API Backend

This repository provides a backend service to fetch character data from the Nexon MapleStory API, utilizing a clean, layered architecture to separate concerns.

## 🚀 Architecture Overview

The application follows a tiered architecture (Client -> Server -> Service Layer -> External API) for robust separation of concerns and maintainability.

1.  **Client:** The frontend that consumes the public API endpoint (`/api/character`).
2.  **Server (server.js):** Acts as the entry point and HTTP handler. Its sole responsibility is setting up Express, handling middleware, validating incoming requests, and routing calls to the Service Layer. It contains no direct API calling logic.
3.  **Service Layer (services/mapleStoryService.js):** This dedicated module abstracts all external communication with Nexon APIs. It encapsulates API keys, endpoint URLs, HTTP client interactions (Axios), and complex error handling/mapping, shielding the rest of the application from external API details.
4.  **External API:** The third-party MapleStory API provided by Nexon.

## ⚙️ Module Responsibilities

*   **`server.js`**:
    *   Express setup and initialization.
    *   Defines HTTP routes (`/api/character`).
    *   Handles request validation (e.g., checking for `character_name`).
    *   Calls the `mapleStoryService` to perform business logic.
    *   Manages HTTP response status codes and JSON structure.

*   **`services/mapleStoryService.js`**:
    *   Contains the core business logic for fetching character data (e.g., sequential calls to get OCID, then get basic info).
    *   Handles all `axios` calls, including base URL construction, API key management, and request parameters.
    *   Implements robust try/catch blocks to map external API errors into standardized, predictable service errors for the Server Layer.

## 💡 How To Run The Project

### Prerequisites

*   Node.js and npm installed.
*   A `.env` file containing your Nexon API Key: `NEXON_API_KEY=YOUR_API_KEY`.

### Step-by-Step Instructions

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Start the Server:**
    ```bash
    node server.js
    ```
3.  **Test API Endpoint:**
    The service is available at `http://localhost:3000/api/character?character_name=CharacterName`.

This refactoring ensures that if the Nexon API changes its structure or rate limits, only `services/mapleStoryService.js` needs to be updated, leaving `server.js` untouched.