import "dotenv/config";
import mongoose from "mongoose";
import { Movie, Show, Theatre, User } from "./models.js";

if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI.");
await mongoose.connect(process.env.MONGODB_URI);

const movies = [
  { title: "Dune: Part Two", synopsis: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.", poster: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", backdrop: "https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg", genres: ["Sci-Fi", "Adventure"], language: "English", duration: 166, rating: 8.5, featured: true },
  { title: "The Wild Robot", synopsis: "A robot finds herself stranded on an uninhabited island and builds unexpected bonds with the wildlife around her.", poster: "https://image.tmdb.org/t/p/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg", genres: ["Animation", "Family"], language: "English", duration: 102, rating: 8.2 },
  { title: "Spider-Man: Across the Spider-Verse", synopsis: "Miles Morales is catapulted across the Multiverse, where he encounters a team of Spider-People protecting its existence.", poster: "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", genres: ["Animation", "Action"], language: "English", duration: 140, rating: 8.6 },
  { title: "Past Lives", synopsis: "Two deeply connected childhood friends are wrested apart after one family emigrates from South Korea.", poster: "https://image.tmdb.org/t/p/w500/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg", genres: ["Romance", "Drama"], language: "English", duration: 106, rating: 7.9 },
  { title: "Interstellar", synopsis: "A team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.", poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", genres: ["Sci-Fi", "Adventure"], language: "English", duration: 169, rating: 8.7 },
  { title: "Everything Everywhere All at Once", synopsis: "An exhausted laundromat owner discovers she may be the key to saving the multiverse.", poster: "https://image.tmdb.org/t/p/w500/w3LqiO9dWyn2O5A8i2eX7g6X7qJ.jpg", genres: ["Action", "Adventure"], language: "English", duration: 140, rating: 7.8 },
  { title: "The Grand Budapest Hotel", synopsis: "A legendary concierge and his young protégé become wrapped up in a whirlwind of art, intrigue, and a family fortune.", poster: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHwSye3yYt4l.jpg", genres: ["Comedy", "Adventure"], language: "English", duration: 100, rating: 8.1 },
  { title: "Coco", synopsis: "A young musician journeys to the Land of the Dead to uncover his family's story and follow his dream.", poster: "https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg", genres: ["Animation", "Family"], language: "English", duration: 105, rating: 8.4 }
];
const savedMovies = [];
for (const movie of movies) {
  savedMovies.push(await Movie.findOneAndUpdate({ title: movie.title }, { $setOnInsert: movie }, { new: true, upsert: true }));
}
let theatre = await Theatre.findOne({ name: "The Grand Cinema" });
if (!theatre) theatre = await Theatre.create({ name: "The Grand Cinema", location: "Downtown", address: "18 Market Street", screens: 4 });

for (let index = 0; index < savedMovies.length; index += 1) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const todayShow = new Date(now.getTime() + (20 + index * 3) * 60 * 1000);
  todayShow.setUTCSeconds(0, 0);
  const tomorrowShow = new Date(tomorrowStart);
  tomorrowShow.setUTCHours(15 + (index % 4) * 2, 30, 0, 0);
  const showtimes = todayShow < tomorrowStart ? [todayShow, tomorrowShow] : [tomorrowShow];
  for (const startsAt of showtimes) {
    const alreadyScheduled = await Show.exists({
      movie: savedMovies[index]._id,
      theatre: theatre._id,
      startsAt: { $gte: startsAt < tomorrowStart ? now : tomorrowStart, $lt: startsAt < tomorrowStart ? tomorrowStart : new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000) }
    });
    if (!alreadyScheduled) {
    const seats = Array.from({ length: 60 }, (_, seatIndex) => ({ number: `${String.fromCharCode(65 + Math.floor(seatIndex / 10))}${(seatIndex % 10) + 1}` }));
    await Show.create({ movie: savedMovies[index]._id, theatre: theatre._id, startsAt, price: 14.5, format: "IMAX", seats });
    }
  }
}

const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@imovies.local";
if (!(await User.exists({ email: adminEmail }))) {
  await User.create({ name: "iMovies Admin", email: adminEmail, password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!", role: "admin" });
}
console.log(`Seed complete. Admin: ${adminEmail} (change the seed password before deployment).`);
await mongoose.disconnect();
