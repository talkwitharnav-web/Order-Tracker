RULE: At the conclusion of every single task or prompt moving forward, the AI agent MUST silently update this SYSTEM_MEMORY.md file to reflect any new files created, functions modified, or architectural shifts before declaring the mission accomplished.

You are strictly forbidden from overwriting, deleting, or summarizing the historical contents of this file. When asked to update this file, you MUST first read its entire contents. You must PRESERVE all existing architectural notes, file hierarchies, and route dictionaries. You may only APPEND new information or safely MODIFY specific lines that have explicitly changed.

# SYSTEM MEMORY

## High-Level Overview

**Tech Stack:** Next.js (React) frontend, Next.js API Routes for the backend, and SQLite for the database.

**User Roles:**
1.  **Customer:** The end-user who browses restaurants and places orders.
2.  **Kitchen (Restaurant):** The restaurant staff who manage orders and restaurant details.
3.  **Admin:** Super-user with access to the raw database and system-wide settings.

## Current State & Known Quirks

*   **Next.js 15 Routing:** The project uses Next.js 15, which requires `await` for `params` in dynamic routes.
*   **POS Uppercase Convention:** All data sent to the Point-of-Sale (POS) system must be in `UPPERCASE`.
*   **Database Seeding:** The application has seed routes to populate the database with initial data.
*   **API Development:** There are dev routes for database management.

## File Hierarchy

```
/src
├───app
│   ├───admin
│   │   ├───db
│   │   │   └───page.tsx
│   │   └───page.tsx
│   ├───api
│   │   ├───dev
│   │   │   ├───db
│   │   │   │   └───route.ts
│   │   │   └───seed
│   │   │       └───route.ts
│   │   ├───orders
│   │   │   ├───[id]
│   │   │   │   └───route.ts
│   │   │   ├───restaurant
│   │   │   │   └───[restaurantName]
│   │   │   │       └───route.ts
│   │   │   └───search
│   │   │   │   └───route.ts
│   │   │   └───route.ts
│   │   ├───restaurants
│   │   │   ├───[id]
│   │   │   │   ├───password
│   │   │   │   │   └───route.ts
│   │   │   │   └───route.ts
│   │   │   ├───login
│   │   │   │   └───route.ts
│   │   │   └───register
│   │   │       └───route.ts
│   │   └───seed
│   │       └───route.ts
│   ├───customer
│   │   └───page.tsx
│   ├───restaurant
│   │   ├───register
│   │   │   └───page.tsx
│   │   ├───Dashboard.tsx
│   │   └───page.tsx
│   ├───favicon.ico
│   ├───globals.css
│   ├───layout.tsx
│   └───page.tsx
└───lib
    ├───db.ts
    └───logger.ts
```

## Route & Function Dictionary

### Page Routes

*   **`src/app/page.tsx`**: The main landing page, which also serves as the **Admin Login** portal. It includes links to the Kitchen and Customer portals.
*   **`src/app/admin/db/page.tsx`**: A comprehensive **Admin Dashboard** for direct database manipulation.
    *   Allows viewing all `restaurants` and `orders` tables.
    *   Provides actions to "Seed" or "Purge" the entire database.
    *   Allows deleting individual restaurants or orders.
    *   Allows changing a restaurant's password.
    *   Allows updating an order's status.
*   **`src/app/customer/page.tsx`**: The **Customer-facing order tracking page**.
    *   Users can enter a restaurant name and order number to see the real-time status of their order.
    *   The page polls the backend every 5 seconds for updates.
*   **`src/app/restaurant/page.tsx`**: The main entry point for the **Kitchen (Restaurant) role**. It handles login.
    *   If a restaurant is logged in, it displays the `KitchenDashboard`.
    *   If not logged in, it shows a login form.
*   **`src/app/restaurant/register/page.tsx`**: The **Kitchen Registration page**.
    *   Allows a new restaurant to create an account by providing a name and password.
    *   On successful registration, it logs the user in and redirects to the kitchen dashboard.
*   **`src/app/layout.tsx`**: The root layout for the entire application. It sets up the HTML structure, fonts, and metadata.
*   **`src/app/admin/page.tsx`**: This page is a "God Mode" view. It has a simulation mode to view the app as an admin, kitchen, or customer. It has a login page that checks for sessionStorage. The dashboard itself fetches all data from `/api/dev/db` and can purge the database.

### API Routes

*   **`src/app/api/dev/db/route.ts`**: **[DEV]** Manages the entire database.
    *   `GET`: Fetches all data from the `restaurants` and `orders` tables.
    *   `DELETE`: Purges all data from the `restaurants` and `orders` tables.
*   **`src/app/api/dev/seed/route.ts`**: **[DEV]** Seeds the database with initial test data.
    *   `POST`: Clears existing data and inserts a sample restaurant (`The Golden Spoon`) and several sample orders.
*   **`src/app/api/orders/route.ts`**: Manages the creation of new orders.
    *   `POST`: Creates a new order. Requires `restaurant_name` and `order_number`. Interacts with the `orders` table.
    *   `GET`: This seems to be a duplicate of `/api/orders/search`. It fetches an order by `restaurant_name` and `order_number`.
*   **`src/app/api/orders/[id]/route.ts`**: Manages a specific order by its ID.
    *   `PUT`: Updates the `status` of an order. Requires a valid status (`Received`, `Preparing`, `Complete`). Interacts with the `orders` table.
    *   `DELETE`: Deletes an order from the `orders` table.
*   **`src/app/api/orders/restaurant/[restaurantName]/route.ts`**: Fetches orders for a specific restaurant.
    *   `GET`: Retrieves all orders for a given `restaurantName`. It can optionally filter by `status`. It only shows 'Finished' orders from the last 5 minutes. Interacts with the `orders` table.
*   **`src/app/api/orders/search/route.ts`**: Searches for a specific order.
    *   `GET`: Finds and returns a single order based on `restaurant_name` and `order_number`. Interacts with the `orders` table.
*   **`src/app/api/restaurants/login/route.ts`**: Handles restaurant login.
    *   `POST`: Authenticates a restaurant using `name` and `password`. Compares a bcrypt hash. Interacts with the `restaurants` table.
*   **`src/app/api/restaurants/register/route.ts`**: Handles new restaurant registration.
    *   `POST`: Creates a new restaurant with a `name` and `password`. Hashes the password with bcrypt and also stores the raw password. Interacts with the `restaurants` table.
*   **`src/app/api/restaurants/[id]/route.ts`**: Manages a specific restaurant by its ID.
    *   `DELETE`: Deletes a restaurant and all of its associated orders from the `restaurants` and `orders` tables.
*   **`src/app/api/restaurants/[id]/password/route.ts`**: Manages a restaurant's password.
    *   `PUT`: Updates the password for a specific restaurant. It requires the `newPassword` in the body. It updates both the hashed and raw password. Interacts with the `restaurants` table.
*   **`src/app/api/seed/route.ts`**: **[DUPLICATE/OLD]** A seemingly older or alternative seed route.
    *   `GET`: Clears and seeds the `orders` table with sample data for multiple restaurants.

### Components & Libs

*   **`src/app/restaurant/Dashboard.tsx`**: The main dashboard interface for the kitchen, showing orders and allowing status updates. This is not a route but a major component.
    - **Confirmation Modal**: A modal dialog is implemented to confirm critical actions, such as order deletion.
      - **State**: It is controlled by the `orderToDelete` state variable in the `KitchenDashboard` component. A non-null value triggers the modal.
      - **Actions**: It provides "Confirm" and "Cancel" actions.
      - **Styling**: Dark theme, centered overlay.
    - **Toast Notifications**: A toast notification system provides users with feedback on operations (success or error).
      - **State**: Controlled by the `toast` state variable (`{ message: string, type: 'success' | 'error' }`).
      - **Behavior**: Toasts appear in the top-right corner and auto-dismiss after 3 seconds.
      - **Styling**: Color-coded based on `type` (green for success, red for error).
    - **`Sidebar` Component (within `src/app/restaurant/Dashboard.tsx`)**: The navigation sidebar for the kitchen dashboard.
      - **Header Alignment**: The restaurant name and "Kitchen Dashboard" subtitle in the sidebar header now use a flex column container (`flex flex-col items-start gap-1 w-full overflow-hidden px-2 mb-6`).
        - **Restaurant Name**: Uses `text-xl font-bold tracking-tight text-white truncate w-full` with a `title` attribute for full name on hover.
        - **Subtitle**: Uses `text-sm font-medium text-orange-500`.
        - **Purpose**: Ensures consistent alignment and prevents layout breakage with long restaurant names.
*   **`src/lib/db.ts`**: Contains all database initialization and connection logic for SQLite.
*   **`src/lib/logger.ts`**: Contains the application's logging configuration.