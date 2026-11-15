# iMovies

A full-stack cinema booking starter built with MongoDB, Express, React, Node.js, and Socket.IO. It includes account registration/login, role-protected admin tools, movie discovery, showtime filtering, atomic seat reservation, live seat availability events, booking history, and cancellation.

## Requirements

- Node.js 20 or newer (React Router 7 requires Node 20+)
- npm 9 or newer
- MongoDB (local MongoDB or a MongoDB Atlas connection string)

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a long, unique `JWT_SECRET`.
2. Install dependencies from the project root:

   ```sh
   npm install
   ```

3. Seed sample movies, one theatre, showtimes, and a development administrator:

   ```sh
   npm run seed
   ```

   The seed administrator defaults to `admin@imovies.local` / `ChangeMe123!`. Override these with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`, and change the default before using a shared or deployed environment.

4. Start the API and React development server:

   ```sh
   npm run dev
   ```

   The API is at `http://localhost:5000`; the web app is at `http://localhost:5173`. Set `CLIENT_ORIGIN` to the exact frontend origin if it differs.

## Configuration

| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign access tokens |
| `PORT` | API port (default `5000`) |
| `CLIENT_ORIGIN` | Allowed browser origin (default `http://localhost:5173`) |
| `SEED_ADMIN_EMAIL` | Optional seed administrator email |
| `SEED_ADMIN_PASSWORD` | Optional seed administrator password |
| `VITE_API_URL` | Optional client API base URL (default `http://localhost:5000/api`) |

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/movies`, `GET /api/movies/:id`, `GET /api/theatres`, `GET /api/shows`
- `GET /api/shows/:id`, `GET /api/shows/:id/seats`
- `POST /api/bookings`, `GET /api/bookings/mine`, `POST /api/bookings/:id/cancel`
- `GET /api/notifications/mine`, `PATCH /api/notifications/:id/read`
- `/api/admin/*` requires an administrator JWT. Supports movie, theatre, and showtime create/update/delete operations and a recent booking list.

Clients can join `show:<showId>` over Socket.IO with `show:join`; the server emits `seats:updated` when bookings are created or cancelled.

## Payments and production notes

Checkout is deliberately a **demo payment**: it confirms a booking and creates a `DEMO-…` reference without charging a card. Integrate a payment provider using its server-side SDK and verified webhooks before accepting real payments; never collect or store raw card details in this app.

Seat assignment is conditional and performed atomically on the show document to prevent two concurrent requests from reserving the same seats. For production resilience across booking and payment records, use a MongoDB replica set and a transaction/outbox workflow. Configure HTTPS, rotate the JWT secret, change the seeded administrator credentials, and use centralized production logging/monitoring before deployment.

## Build

```sh
npm run build
```
