import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user" }
}, { timestamps: true });

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.checkPassword = function checkPassword(password) {
  return bcrypt.compare(password, this.password);
};

const movieSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  synopsis: { type: String, default: "" },
  poster: { type: String, default: "" },
  backdrop: { type: String, default: "" },
  genres: [{ type: String, trim: true }],
  language: { type: String, default: "English" },
  duration: { type: Number, min: 1, default: 120 },
  rating: { type: Number, min: 0, max: 10, default: 0 },
  releaseDate: { type: Date },
  featured: { type: Boolean, default: false }
}, { timestamps: true });
movieSchema// text index removed

const theatreSchema = new Schema({
  name: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  address: { type: String, default: "" },
  screens: { type: Number, min: 1, default: 1 }
}, { timestamps: true });

const seatSchema = new Schema({
  number: { type: String, required: true },
  status: { type: String, enum: ["available", "booked"], default: "available" },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", default: null }
}, { _id: false });

const showSchema = new Schema({
  movie: { type: Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  theatre: { type: Schema.Types.ObjectId, ref: "Theatre", required: true, index: true },
  screen: { type: Number, min: 1, default: 1 },
  startsAt: { type: Date, required: true, index: true },
  format: { type: String, default: "2D" },
  price: { type: Number, required: true, min: 0 },
  seats: { type: [seatSchema], default: [] }
}, { timestamps: true });
showSchema.index({ movie: 1, theatre: 1, startsAt: 1 });

const bookingSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  show: { type: Schema.Types.ObjectId, ref: "Show", required: true },
  seats: [{ type: String, required: true }],
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed" },
  payment: {
    status: { type: String, enum: ["demo-paid", "refunded"], default: "demo-paid" },
    reference: { type: String, default: "" }
  }
}, { timestamps: true });
bookingSchema.index({ user: 1, createdAt: -1 });

const paymentSchema = new Schema({
  booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["demo-paid", "refunded"], default: "demo-paid" },
  reference: { type: String, required: true, unique: true },
  provider: { type: String, default: "demo" }
}, { timestamps: true });

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["booking-confirmed", "booking-cancelled"], required: true },
  message: { type: String, required: true, maxlength: 240 },
  readAt: { type: Date, default: null }
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });

export const User = model("User", userSchema);
export const Movie = model("Movie", movieSchema);
export const Theatre = model("Theatre", theatreSchema);
export const Show = model("Show", showSchema);
export const Booking = model("Booking", bookingSchema);
export const Payment = model("Payment", paymentSchema);
export const Notification = model("Notification", notificationSchema);


