import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { rateLimit } from "express-rate-limit";
import { Booking, Movie, Notification, Payment, Show, Theatre, User } from "./models.js";

const required = ["MONGODB_URI", "JWT_SECRET"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }
});
app.set("io", io);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const tokenFor = (user) => jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

const auth = asyncRoute(async (req, _res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw fail(401, "Please sign in to continue.");
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) throw fail(401, "Your session is no longer valid.");
    req.user = user;
    next();
  } catch (error) {
    if (error.status) throw error;
    throw fail(401, "Your session is invalid or expired.");
  }
});
const adminOnly = (req, _res, next) => {
  if (req.user?.role !== "admin") return next(fail(403, "Administrator access is required."));
  next();
};

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== "string" || name.trim().length < 2) throw fail(400, "Name must contain at least 2 characters.");
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8) throw fail(400, "Password must be at least 8 characters.");
  if (await User.exists({ email: email.toLowerCase().trim() })) throw fail(409, "An account with this email already exists.");
  const user = await User.create({ name: name.trim(), email, password });
  res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") throw fail(400, "Email and password are required.");
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
  if (!user || !(await user.checkPassword(password))) throw fail(401, "Email or password is incorrect.");
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));
app.get("/api/auth/me", auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.get("/api/movies", asyncRoute(async (req, res) => {
  const { q, genre, language, page = "1", limit = "12" } = req.query;
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(limit, 10) || 12));
  const filter = {};
  if (q) filter.title = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (genre) filter.genres = String(genre);
  if (language) filter.language = String(language);
  const [movies, total] = await Promise.all([
    Movie.find(filter).sort({ featured: -1, createdAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize).lean(),
    Movie.countDocuments(filter)
  ]);
  res.json({ movies, page: pageNumber, pages: Math.ceil(total / pageSize), total });
}));
app.get("/api/movies/:id", asyncRoute(async (req, res) => {
  const movie = await Movie.findById(req.params.id).lean();
  if (!movie) throw fail(404, "Movie not found.");
  res.json({ movie });
}));

app.get("/api/theatres", asyncRoute(async (_req, res) => res.json({ theatres: await Theatre.find().sort({ location: 1, name: 1 }).lean() })));
app.get("/api/shows", asyncRoute(async (req, res) => {
  const filter = { startsAt: { $gte: new Date() } };
  if (req.query.movie) filter.movie = req.query.movie;
  if (req.query.theatre) filter.theatre = req.query.theatre;
  if (req.query.date) {
    const start = new Date(`${req.query.date}T00:00:00`);
    if (Number.isNaN(start.getTime())) throw fail(400, "Date must use YYYY-MM-DD format.");
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.startsAt = { $gte: start > new Date() ? start : new Date(), $lt: end };
  }
  const shows = await Show.find(filter).populate("movie", "title poster duration").populate("theatre", "name location address").sort({ startsAt: 1 }).limit(100).lean();
  res.json({ shows });
}));
app.get("/api/shows/:id", asyncRoute(async (req, res) => {
  const show = await Show.findById(req.params.id).populate("movie", "title poster duration").populate("theatre", "name location address").lean();
  if (!show) throw fail(404, "Show not found.");
  res.json({ show });
}));
app.get("/api/shows/:id/seats", asyncRoute(async (req, res) => {
  const show = await Show.findById(req.params.id).select("seats").lean();
  if (!show) throw fail(404, "Show not found.");
  res.json({ seats: show.seats.map(({ number, status }) => ({ number, status })) });
}));

app.post("/api/bookings", auth, asyncRoute(async (req, res) => {
  const showId = req.body.showId;
  const seats = req.body.seats;
  if (typeof showId !== "string" || !Array.isArray(seats) || seats.length < 1 || seats.length > 10) {
    throw fail(400, "Choose a show and between 1 and 10 seats.");
  }
  if (seats.some((seat) => typeof seat !== "string" || !/^[A-Z]\d{1,2}$/.test(seat)) || new Set(seats).size !== seats.length) {
    throw fail(400, "Seat selection is invalid.");
  }
  const show = await Show.findOneAndUpdate(
    { _id: showId, startsAt: { $gt: new Date() }, seats: { $all: seats.map((number) => ({ $elemMatch: { number, status: "available" } })) } },
    { $set: { "seats.$[seat].status": "booked" } },
    { arrayFilters: [{ "seat.number": { $in: seats }, "seat.status": "available" }], new: true }
  ).select("price seats");
  if (!show) throw fail(409, "One or more selected seats are no longer available. Please refresh and try again.");
  let booking;
  let notification;
  const paymentReference = `DEMO-${crypto.randomUUID()}`;
  try {
    booking = await Booking.create({
      user: req.user.id, show: showId, seats, total: show.price * seats.length,
      payment: { status: "demo-paid", reference: paymentReference }
    });
    await Payment.create({ booking: booking.id, user: req.user.id, amount: booking.total, reference: paymentReference });
    notification = await Notification.create({ user: req.user.id, kind: "booking-confirmed", message: `Your booking for seats ${seats.join(", ")} is confirmed.` });
    await Show.updateOne({ _id: showId }, { $set: { "seats.$[seat].bookingId": booking.id } }, { arrayFilters: [{ "seat.number": { $in: seats } }] });
  } catch (error) {
    if (booking) {
      await Promise.all([Booking.deleteOne({ _id: booking.id }), Payment.deleteOne({ booking: booking.id })]);
    }
    if (notification) await Notification.deleteOne({ _id: notification.id });
    await Show.updateOne({ _id: showId }, { $set: { "seats.$[seat].status": "available", "seats.$[seat].bookingId": null } }, { arrayFilters: [{ "seat.number": { $in: seats } }] });
    throw error;
  }
  io.to(`show:${showId}`).emit("seats:updated", { showId, seats, status: "booked" });
  res.status(201).json({ booking: await booking.populate({ path: "show", populate: [{ path: "movie", select: "title poster" }, { path: "theatre", select: "name location" }] }) });
}));

app.get("/api/bookings/mine", auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [bookings, total] = await Promise.all([
    Booking.find({ user: req.user.id }).populate({ path: "show", populate: [{ path: "movie", select: "title poster" }, { path: "theatre", select: "name location" }] }).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(),
    Booking.countDocuments({ user: req.user.id })
  ]);
  res.json({ bookings, page, pages: Math.ceil(total / 20), total });
}));
app.get("/api/notifications/mine", auth, asyncRoute(async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ notifications });
}));
app.patch("/api/notifications/:id/read", auth, asyncRoute(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw fail(404, "Notification not found.");
  res.json({ notification });
}));
app.post("/api/bookings/:id/cancel", auth, asyncRoute(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user.id });
  if (!booking) throw fail(404, "Booking not found.");
  if (booking.status === "cancelled") throw fail(409, "This booking has already been cancelled.");
  const show = await Show.findById(booking.show).select("startsAt");
  if (!show || show.startsAt <= new Date()) throw fail(400, "Bookings cannot be cancelled after the show has started.");
  const cancelled = await Booking.findOneAndUpdate(
    { _id: booking.id, status: "confirmed" },
    { $set: { status: "cancelled", "payment.status": "refunded" } },
    { new: true }
  );
  if (!cancelled) throw fail(409, "This booking has already been cancelled.");
  await Payment.updateOne({ booking: booking.id }, { $set: { status: "refunded" } });
  await Show.updateOne(
    { _id: booking.show },
    { $set: { "seats.$[seat].status": "available", "seats.$[seat].bookingId": null } },
    { arrayFilters: [{ "seat.number": { $in: booking.seats }, "seat.bookingId": booking.id }] }
  );
  await Notification.create({ user: req.user.id, kind: "booking-cancelled", message: `Your booking for seats ${booking.seats.join(", ")} was cancelled.` });
  io.to(`show:${booking.show}`).emit("seats:updated", { showId: String(booking.show), seats: booking.seats, status: "available" });
  res.json({ booking: cancelled });
}));

app.use("/api/admin", auth, adminOnly);
app.post("/api/admin/movies", asyncRoute(async (req, res) => {
  const movie = await Movie.create(req.body);
  res.status(201).json({ movie });
}));
app.put("/api/admin/movies/:id", asyncRoute(async (req, res) => {
  const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!movie) throw fail(404, "Movie not found.");
  res.json({ movie });
}));
app.delete("/api/admin/movies/:id", asyncRoute(async (req, res) => {
  if (await Show.exists({ movie: req.params.id })) throw fail(409, "Remove this movie's shows before deleting it.");
  const movie = await Movie.findByIdAndDelete(req.params.id);
  if (!movie) throw fail(404, "Movie not found.");
  res.json({ message: "Movie deleted." });
}));
app.post("/api/admin/theatres", asyncRoute(async (req, res) => res.status(201).json({ theatre: await Theatre.create(req.body) })));
app.put("/api/admin/theatres/:id", asyncRoute(async (req, res) => {
  const theatre = await Theatre.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!theatre) throw fail(404, "Theatre not found.");
  res.json({ theatre });
}));
app.delete("/api/admin/theatres/:id", asyncRoute(async (req, res) => {
  if (await Show.exists({ theatre: req.params.id })) throw fail(409, "Remove this theatre's shows before deleting it.");
  const theatre = await Theatre.findByIdAndDelete(req.params.id);
  if (!theatre) throw fail(404, "Theatre not found.");
  res.json({ message: "Theatre deleted." });
}));
app.post("/api/admin/shows", asyncRoute(async (req, res) => {
  const { movie, theatre, startsAt, price, screen = 1, format = "2D", rows = 6, seatsPerRow = 10 } = req.body;
  if (!Number.isInteger(rows) || rows < 1 || rows > 12 || !Number.isInteger(seatsPerRow) || seatsPerRow < 1 || seatsPerRow > 20) {
    throw fail(400, "Seat layout must be between 1-12 rows and 1-20 seats per row.");
  }
  const seatList = Array.from({ length: rows * seatsPerRow }, (_, index) => ({
    number: `${String.fromCharCode(65 + Math.floor(index / seatsPerRow))}${(index % seatsPerRow) + 1}`
  }));
  const show = await Show.create({ movie, theatre, startsAt, price, screen, format, seats: seatList });
  res.status(201).json({ show });
}));
app.put("/api/admin/shows/:id", asyncRoute(async (req, res) => {
  const { movie, theatre, startsAt, price, screen, format } = req.body;
  if (await Booking.exists({ show: req.params.id, status: "confirmed" })) throw fail(409, "A show with confirmed bookings cannot be edited.");
  const show = await Show.findByIdAndUpdate(req.params.id, { movie, theatre, startsAt, price, screen, format }, { new: true, runValidators: true });
  if (!show) throw fail(404, "Show not found.");
  res.json({ show });
}));
app.delete("/api/admin/shows/:id", asyncRoute(async (req, res) => {
  const show = await Show.findById(req.params.id);
  if (!show) throw fail(404, "Show not found.");
  if (await Booking.exists({ show: show.id, status: "confirmed" })) throw fail(409, "A show with confirmed bookings cannot be deleted.");
  await show.deleteOne();
  res.json({ message: "Show deleted." });
}));
app.get("/api/admin/bookings", asyncRoute(async (req, res) => {
  const bookings = await Booking.find().populate("user", "name email").populate({ path: "show", populate: [{ path: "movie", select: "title" }, { path: "theatre", select: "name" }] }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ bookings });
}));

io.on("connection", (socket) => {
  socket.on("show:join", (showId) => {
    if (typeof showId === "string" && mongoose.isValidObjectId(showId)) socket.join(`show:${showId}`);
  });
  socket.on("show:leave", (showId) => {
    if (typeof showId === "string" && mongoose.isValidObjectId(showId)) socket.leave(`show:${showId}`);
  });
});

app.use((req, _res, next) => next(fail(404, `Route not found: ${req.method} ${req.path}`)));
app.use((error, _req, res, _next) => {
  const status = error.status || (error.name === "ValidationError" || error.name === "CastError" ? 400 : error.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status >= 500 ? "An unexpected server error occurred." : error.message });
});

const port = Number(process.env.PORT) || 5000;
await mongoose.connect(process.env.MONGODB_URI);
httpServer.listen(port, () => console.log(`iMovies API listening on port ${port}`));
