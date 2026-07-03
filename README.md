# Restaurant Order Tracker

A Next.js application for real-time restaurant order management. It uses a single App Router instance to serve three distinct environments: a kitchen dashboard, a public customer tracker, and an admin control center.

## Features

* **Shared Backend:** One Next.js server handling `/restaurant`, `/customer`, and `/admin` routes.
* **State Management:** Optimistic UI updates on the frontend with a 5-second background polling interval for sync.
* **Admin Simulation:** Admin route includes live monitoring and component-level simulation for both kitchen and customer views.
* **Input Masking:** Strict regex enforcing POS-style formatting (e.g., A-92) and preventing invalid spacing.
* **Local DB:** Uses SQLite for zero-config local development.

## Tech Stack

* Next.js (App Router)
* React
* Tailwind CSS
* SQLite
* Lucide React

## Setup

1. Clone the repository and navigate into the nested Next.js root:
   ```bash
   cd app

Install dependencies:
npm install

Start development server:
npm run dev

The application starts on http://localhost:3000
