import React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const socket = io(API.replace(/\/api\/?$/, ""), { autoConnect: false });
const api = axios.create({ baseURL: API });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("imovies-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const SessionContext = createContext(null);
const useSession = () => useContext(SessionContext);
const prettyDate = (date, options = { weekday: "short", month: "short", day: "numeric" }) => new Intl.DateTimeFormat("en", options).format(new Date(date));
const prettyTime = (date) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(date));

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("imovies-token");
    if (!token) { setReady(true); return; }
    api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => localStorage.removeItem("imovies-token")).finally(() => setReady(true));
  }, []);

  const session = useMemo(() => ({
    user,
    openAuth: () => setAuthOpen(true),
    signOut: () => {
      localStorage.removeItem("imovies-token");
      setUser(null);
      toast.success("You’re signed out.");
    },
    setAuthenticated: (data) => {
      localStorage.setItem("imovies-token", data.token);
      setUser(data.user);
      setAuthOpen(false);
    }
  }), [user]);

  return (
    <SessionContext.Provider value={session}>
      <Toaster position="top-center" toastOptions={{ style: { background: "#252426", color: "#fff", border: "1px solid #3b393d" } }} />
      <Header />
      <main>
        {!ready ? <div className="page-loading"><span className="spinner-border" /></div> : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movie/:id" element={<MoviePage />} />
            <Route path="/show/:id" element={<ShowPage />} />
            <Route path="/account" element={<PrivateRoute><AccountPage /></PrivateRoute>} />
            <Route path="/admin" element={<PrivateRoute admin><AdminPage /></PrivateRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
      <Footer />
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </SessionContext.Provider>
  );
}

function Header() {
  const { user, openAuth, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMovies, setMenuMovies] = useState([]);
  useEffect(() => { api.get("/movies", { params: { limit: 12 } }).then(({ data }) => setMenuMovies(data.movies || [])).catch(() => {}); }, []);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" to="/"><span className="brand-mark">i</span>movies<span className="brand-dot">.</span></Link>
        <nav className="desktop-nav">
          <div className="movie-menu-wrap">
            <button className={`movie-menu-trigger ${menuOpen ? "active" : ""}`} aria-expanded={menuOpen} aria-haspopup="true" onClick={() => setMenuOpen((open) => !open)}>Movies <span>{menuOpen ? "−" : "+"}</span></button>
            {menuOpen && <div className="movie-menu" role="menu"><div className="movie-menu-heading"><span>NOW PLAYING</span><Link to="/#movies" onClick={() => setMenuOpen(false)}>View all →</Link></div>{menuMovies.length ? menuMovies.map((movie) => <Link role="menuitem" key={movie._id} to={`/movie/${movie._id}`} onClick={() => setMenuOpen(false)}><span>{movie.title}</span><small>{movie.genres?.slice(0, 2).join(" · ")}</small></Link>) : <Link role="menuitem" to="/#movies" onClick={() => setMenuOpen(false)}>Explore the movie list →</Link>}</div>}
          </div>
          <a href="/#experience">The experience</a>
        </nav>
        <div className="header-actions">
          {user ? <>
            {user.role === "admin" && <Link className="admin-link" to="/admin">Admin</Link>}
            <Link className="account-link" to="/account"><span className="avatar">{user.name?.[0]?.toUpperCase()}</span><span className="account-name">{user.name.split(" ")[0]}</span></Link>
            <button className="icon-btn signout-btn" onClick={signOut} aria-label="Sign out" title="Sign out">↗</button>
          </> : <button className="btn btn-outline-light sign-in-btn" onClick={openAuth}>Sign in <span>↗</span></button>}
        </div>
      </div>
    </header>
  );
}

function Home() {
  const [movies, setMovies] = useState([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/movies", { params: { q: query || undefined, genre: genre || undefined, limit: 24 } })
      .then(({ data }) => setMovies(data.movies))
      .catch(() => toast.error("Couldn’t load movies. Check that the API is running."))
      .finally(() => setLoading(false));
  }, [query, genre]);

  const featured = movies.find((movie) => movie.featured) || movies[0];
  return (
    <>
      {featured && !query && !genre && <section className="hero" style={{ "--hero-image": `url("${featured.backdrop || featured.poster}")` }}>
        <div className="hero-shade" />
        <div className="container hero-content">
          <div className="eyebrow"><span className="live-dot" /> NOW SHOWING <span className="eyebrow-divider">/</span> {featured.genres?.slice(0, 2).join(" · ")}</div>
          <h1>Your next<br /><span>great escape.</span></h1>
          <p>Big stories. Bigger screens. Find your seat for the movies everyone will be talking about.</p>
          <div className="hero-actions"><Link className="btn btn-coral" to={`/movie/${featured._id}`}>Book tickets <span>→</span></Link><a className="text-link" href="#movies">Explore movies <span>↓</span></a></div>
          <div className="hero-note"><span className="hero-note-line" /> A better kind of movie night</div>
        </div>
        <div className="hero-index">01 <span>/</span> 04</div>
      </section>}

      <section id="movies" className="container movie-section">
        <div className="section-heading">
          <div><div className="eyebrow muted-eyebrow">PICK YOUR PICTURE</div><h2>Now showing<span className="brand-dot">.</span></h2></div>
          <div className="movie-controls">
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a movie" aria-label="Search movies" /><kbd>⌘ K</kbd></label>
            <select className="genre-select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filter by genre">
              <option value="">All genres</option><option>Action</option><option>Adventure</option><option>Animation</option><option>Drama</option><option>Family</option><option>Romance</option><option>Sci-Fi</option>
            </select>
          </div>
        </div>
        {loading ? <div className="loading-row"><span className="spinner-border spinner-border-sm" /> Finding your next favorite…</div> :
          movies.length ? <div className="movie-grid">{movies.map((movie, index) => <MovieCard key={movie._id} movie={movie} index={index} />)}</div> :
            <div className="empty-state"><span>◌</span><h3>No movies found</h3><p>Try a different title or clear your filters.</p><button className="text-button" onClick={() => { setQuery(""); setGenre(""); }}>Clear filters →</button></div>}
      </section>

      <section id="experience" className="experience-band">
        <div className="container experience-inner"><div className="experience-icon">✳</div><div><div className="eyebrow">THE iMOVIES DIFFERENCE</div><h2>More than a movie.<br /><span>It’s a whole night out.</span></h2></div><div className="experience-aside"><p>Pick your seats in real time, get your tickets instantly, and settle in. Your only job is to enjoy the show.</p><a href="#movies" className="text-link">Find your next film <span>→</span></a></div></div>
      </section>
    </>
  );
}

function MovieCard({ movie, index }) {
  return <Link className="movie-card" to={`/movie/${movie._id}`} style={{ "--card-delay": `${index * 55}ms` }}>
    <div className="poster-wrap">
      {movie.poster ? <img src={movie.poster} alt={`${movie.title} poster`} loading="lazy" /> : <div className="poster-placeholder">i<span>movies</span></div>}
      <div className="poster-overlay"><span>View showtimes <b>→</b></span></div>
      {movie.rating > 0 && <span className="rating-badge">★ {movie.rating.toFixed(1)}</span>}
    </div>
    <div className="movie-card-meta"><div><h3>{movie.title}</h3><p>{movie.genres?.slice(0, 2).join(" · ")} <span>·</span> {movie.duration} min</p></div><span className="card-arrow">↗</span></div>
  </Link>;
}

function MoviePage() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all([api.get(`/movies/${id}`), api.get("/shows", { params: { movie: id, date } })])
      .then(([movieResponse, showResponse]) => { setMovie(movieResponse.data.movie); setShows(showResponse.data.shows); })
      .catch((error) => toast.error(error.response?.data?.message || "Couldn’t load movie details."))
      .finally(() => setLoading(false));
  }, [id, date]);
  if (loading) return <div className="page-loading"><span className="spinner-border" /></div>;
  if (!movie) return <NotFound />;
  return <div className="inner-page">
    <div className="container">
      <Link to="/" className="back-link">← All movies</Link>
      <div className="movie-detail">
        <div className="detail-poster">{movie.poster && <img src={movie.poster} alt={`${movie.title} poster`} />}</div>
        <div className="detail-copy"><div className="eyebrow muted-eyebrow">NOW SHOWING</div><h1>{movie.title}</h1><p className="detail-tags">{movie.genres?.join(" · ")} <span>•</span> {movie.language} <span>•</span> {movie.duration} min {movie.rating > 0 && <> <span>•</span> ★ {movie.rating.toFixed(1)}</>}</p><p className="synopsis">{movie.synopsis || "The perfect movie night starts right here. Choose a showtime and make it yours."}</p>
          <div className="showtimes"><div className="showtime-heading"><h2>Choose a showtime</h2><input aria-label="Choose show date" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} /></div>
            {shows.length ? <div className="show-list">{shows.map((show) => <Link className="show-card" key={show._id} to={`/show/${show._id}`}><div><strong>{prettyTime(show.startsAt)}</strong><span>{show.theatre?.name} · {show.theatre?.location}</span></div><span className="show-format">{show.format}</span><span className="show-price">${show.price.toFixed(2)} <b>→</b></span></Link>)}</div> : <div className="no-shows">No showtimes on this date. Try another day.</div>}
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function ShowPage() {
  const { id } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  const load = () => Promise.all([api.get(`/shows/${id}`), api.get(`/shows/${id}/seats`)]).then(([showResponse, seatResponse]) => {
    setShow(showResponse.data.show);
    setSeats(seatResponse.data.seats);
  });
  useEffect(() => {
    setLoading(true);
    load().catch((error) => toast.error(error.response?.data?.message || "Couldn’t load this show.")).finally(() => setLoading(false));
    socket.connect();
    socket.emit("show:join", id);
    const updateSeats = (event) => {
      if (event.showId !== id) return;
      setSeats((current) => current.map((seat) => event.seats.includes(seat.number) ? { ...seat, status: event.status } : seat));
      setSelected((current) => current.filter((seat) => !event.seats.includes(seat)));
      toast("Seat availability updated.", { icon: "↻" });
    };
    socket.on("seats:updated", updateSeats);
    return () => { socket.emit("show:leave", id); socket.off("seats:updated", updateSeats); };
  }, [id]);

  const toggleSeat = (number) => setSelected((current) => current.includes(number) ? current.filter((item) => item !== number) : current.length >= 10 ? (toast.error("You can select up to 10 seats."), current) : [...current, number]);
  const book = async () => {
    if (!selected.length) return;
    if (!user) {
      const demoSeats = [...selected];
      setSeats((current) => current.map((seat) => demoSeats.includes(seat.number) ? { ...seat, status: "booked" } : seat));
      setSelected([]);
      toast.success(`Demo booking confirmed for ${demoSeats.join(", ")}. No account or payment needed.`);
      return;
    }
    setBooking(true);
    try {
      await api.post("/bookings", { showId: id, seats: selected });
      toast.success("You’re all set. Enjoy the show!");
      navigate("/account");
    } catch (error) {
      toast.error(error.response?.data?.message || "Booking failed. Please try again.");
      await load();
    } finally { setBooking(false); }
  };
  if (loading) return <div className="page-loading"><span className="spinner-border" /></div>;
  if (!show) return <NotFound />;
  const rows = [...new Set(seats.map((seat) => seat.number[0]))];
  return <div className="inner-page seat-page"><div className="container">
    <Link to={`/movie/${show.movie?._id}`} className="back-link">← Back to showtimes</Link>
    <div className="seat-heading"><div><div className="eyebrow muted-eyebrow">PICK YOUR SEATS</div><h1>{show.movie?.title}</h1><p>{show.theatre?.name} · {prettyDate(show.startsAt, { weekday: "long", month: "long", day: "numeric" })} · {prettyTime(show.startsAt)} · {show.format}</p></div><div className="show-price-pill">${show.price.toFixed(2)} <span>/ seat</span></div></div>
    <div className="seat-layout">
      <div className="screen"><span>SCREEN</span></div>
      <div className="seat-grid">{rows.map((row) => <div className="seat-row" key={row}><span className="row-label">{row}</span>{seats.filter((seat) => seat.number[0] === row).map((seat) => <button key={seat.number} aria-label={`Seat ${seat.number}${seat.status === "booked" ? ", booked" : ""}`} disabled={seat.status === "booked"} className={`seat ${seat.status === "booked" ? "booked" : selected.includes(seat.number) ? "selected" : ""}`} onClick={() => toggleSeat(seat.number)}>{seat.number.slice(1)}</button>)}<span className="row-label">{row}</span></div>)}</div>
      <div className="seat-legend"><span><i className="legend-seat" /> Available</span><span><i className="legend-seat picked" /> Selected</span><span><i className="legend-seat unavailable" /> Taken</span></div>
    </div>
    <div className="booking-bar"><div><span className="booking-label">YOUR SELECTION</span><strong>{selected.length ? [...selected].sort().join(", ") : "Choose your seats"}</strong></div><div className="booking-total"><span>{selected.length} {selected.length === 1 ? "seat" : "seats"}</span><strong>${(selected.length * show.price).toFixed(2)}</strong></div><button className="btn btn-coral" disabled={!selected.length || booking} onClick={book}>{booking ? "Booking…" : user ? "Confirm booking →" : "Try demo booking →"}</button></div>
    <p className="demo-payment-note">{user ? "Demo checkout · no real payment is processed" : "Prototype mode · try a seat selection without signing in or paying"}</p>
  </div></div>;
}

function AccountPage() {
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = () => Promise.all([api.get("/bookings/mine"), api.get("/notifications/mine")]).then(([bookingResponse, notificationResponse]) => {
    setBookings(bookingResponse.data.bookings);
    setNotifications(notificationResponse.data.notifications);
  });
  useEffect(() => { refresh().catch(() => toast.error("Couldn’t load your account.")).finally(() => setLoading(false)); }, []);
  const cancel = async (id) => {
    try { await api.post(`/bookings/${id}/cancel`); toast.success("Booking cancelled. Seats are available again."); await refresh(); }
    catch (error) { toast.error(error.response?.data?.message || "Couldn’t cancel this booking."); }
  };
  const markRead = async (notification) => {
    if (notification.readAt) return;
    try {
      const { data } = await api.patch(`/notifications/${notification._id}/read`);
      setNotifications((current) => current.map((item) => item._id === notification._id ? data.notification : item));
    } catch (error) { toast.error(error.response?.data?.message || "Couldn’t update notification."); }
  };
  const upcoming = bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.show?.startsAt) > new Date());
  const past = bookings.filter((booking) => !upcoming.includes(booking));
  return <div className="inner-page account-page"><div className="container">
    <div className="page-title"><div className="eyebrow muted-eyebrow">YOUR iMOVIES</div><h1>Your tickets<span className="brand-dot">.</span></h1><p>All your movie nights, in one place.</p></div>
    {loading ? <div className="loading-row"><span className="spinner-border spinner-border-sm" /> Loading bookings…</div> : <>
      <h2 className="list-heading">Upcoming <span>{upcoming.length.toString().padStart(2, "0")}</span></h2>
      {upcoming.length ? <div className="booking-list">{upcoming.map((booking) => <BookingCard key={booking._id} booking={booking} onCancel={cancel} />)}</div> : <div className="empty-bookings"><div className="empty-icon">✳</div><h3>No plans on the calendar. Yet.</h3><p>Find a film and make a night of it.</p><Link className="btn btn-coral" to="/">Explore movies →</Link></div>}
      {past.length > 0 && <><h2 className="list-heading past-heading">Past bookings <span>{past.length.toString().padStart(2, "0")}</span></h2><div className="booking-list past-list">{past.map((booking) => <BookingCard key={booking._id} booking={booking} />)}</div></>}
      {notifications.length > 0 && <section className="notifications"><h2 className="list-heading">Notifications <span>{notifications.filter((item) => !item.readAt).length.toString().padStart(2, "0")} NEW</span></h2><div className="notification-list">{notifications.map((notification) => <button key={notification._id} className={`notification-item ${notification.readAt ? "" : "unread"}`} onClick={() => markRead(notification)}><span className="notification-icon">{notification.kind === "booking-confirmed" ? "✓" : "↺"}</span><span className="notification-message">{notification.message}<small>{prettyDate(notification.createdAt, { month: "short", day: "numeric", year: "numeric" })}</small></span><span className="notification-dot" /></button>)}</div></section>}
    </>}
  </div></div>;
}

function BookingCard({ booking, onCancel }) {
  const show = booking.show;
  return <article className={`booking-card ${booking.status === "cancelled" ? "cancelled" : ""}`}>
    <div className="booking-date"><strong>{show?.startsAt ? new Date(show.startsAt).getDate() : "—"}</strong><span>{show?.startsAt ? prettyDate(show.startsAt, { month: "short" }).toUpperCase() : ""}</span></div>
    {show?.movie?.poster ? <img className="booking-poster" src={show.movie.poster} alt="" /> : <div className="booking-poster blank-poster">i</div>}
    <div className="booking-info"><h3>{show?.movie?.title || "Movie"}</h3><p>{show?.theatre?.name} · {show?.theatre?.location}</p><p>{show?.startsAt ? prettyTime(show.startsAt) : ""} <span>·</span> Seats {booking.seats.join(", ")}</p></div>
    <div className="booking-card-end"><strong>${booking.total.toFixed(2)}</strong><span className={`status-tag ${booking.status}`}>{booking.status === "confirmed" ? "Confirmed" : "Cancelled"}</span>{booking.status === "confirmed" && onCancel && <button className="cancel-link" onClick={() => onCancel(booking._id)}>Cancel booking</button>}</div>
  </article>;
}

function AdminPage() {
  const [movies, setMovies] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [shows, setShows] = useState([]);
  const [tab, setTab] = useState("movies");
  const refresh = async () => {
    const [movieResult, theatreResult, showResult] = await Promise.all([api.get("/movies", { params: { limit: 24 } }), api.get("/theatres"), api.get("/shows")]);
    setMovies(movieResult.data.movies); setTheatres(theatreResult.data.theatres); setShows(showResult.data.shows);
  };
  useEffect(() => { refresh().catch(() => toast.error("Couldn’t load admin data.")); }, []);
  return <div className="inner-page admin-page"><div className="container">
    <div className="page-title"><div className="eyebrow muted-eyebrow">CONTROL ROOM</div><h1>Good shows start here<span className="brand-dot">.</span></h1><p>Manage the movies, venues, and showtimes your audience sees.</p></div>
    <div className="admin-tabs">{["movies", "theatres", "showtimes"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}<span>{item === "movies" ? movies.length : item === "theatres" ? theatres.length : shows.length}</span></button>)}</div>
    {tab === "movies" && <MovieAdmin movies={movies} refresh={refresh} />}
    {tab === "theatres" && <TheatreAdmin theatres={theatres} refresh={refresh} />}
    {tab === "showtimes" && <ShowAdmin shows={shows} movies={movies} theatres={theatres} refresh={refresh} />}
  </div></div>;
}

function MovieAdmin({ movies, refresh }) {
  const [form, setForm] = useState({ title: "", synopsis: "", poster: "", language: "English", duration: 120, genres: "" });
  const [editId, setEditId] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, genres: form.genres.split(",").map((genre) => genre.trim()).filter(Boolean), duration: Number(form.duration) };
      if (editId) await api.put(`/admin/movies/${editId}`, payload);
      else await api.post("/admin/movies", payload);
      toast.success(editId ? "Movie updated." : "Movie added.");
      setEditId(""); setForm({ title: "", synopsis: "", poster: "", language: "English", duration: 120, genres: "" });
      await refresh();
    }
    catch (error) { toast.error(error.response?.data?.message || "Couldn’t add movie."); }
  };
  const remove = async (id) => { try { await api.delete(`/admin/movies/${id}`); toast.success("Movie removed."); await refresh(); } catch (error) { toast.error(error.response?.data?.message || "Couldn’t remove movie."); } };
  const edit = (movie) => {
    setEditId(movie._id);
    setForm({ title: movie.title, synopsis: movie.synopsis || "", poster: movie.poster || "", language: movie.language || "English", duration: movie.duration || 120, genres: movie.genres?.join(", ") || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => { setEditId(""); setForm({ title: "", synopsis: "", poster: "", language: "English", duration: 120, genres: "" }); };
  return <div className="admin-content"><form className="admin-form" onSubmit={submit}><h2>{editId ? "Edit movie" : "Add a movie"}</h2><div className="form-grid"><Field label="Movie title"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Poster image URL"><input value={form.poster} onChange={(e) => setForm({ ...form, poster: e.target.value })} /></Field><Field label="Genres (comma separated)"><input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} /></Field><Field label="Language"><input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></Field><Field label="Duration (minutes)"><input type="number" min="1" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></Field><Field label="Synopsis"><input value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} /></Field></div><button className="btn btn-coral">{editId ? "Save changes →" : "Add movie +"}</button>{editId && <button type="button" className="admin-cancel" onClick={reset}>Cancel</button>}</form>
    <div className="admin-list">{movies.map((movie) => <div className="admin-row" key={movie._id}><span className="admin-row-title">{movie.title}</span><span>{movie.genres?.join(" · ")}</span><div className="admin-row-actions"><button className="edit-link" onClick={() => edit(movie)}>Edit</button><button className="danger-link" onClick={() => remove(movie._id)}>Remove</button></div></div>)}</div></div>;
}

function TheatreAdmin({ theatres, refresh }) {
  const [form, setForm] = useState({ name: "", location: "", address: "", screens: 1 });
  const [editId, setEditId] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, screens: Number(form.screens) };
      if (editId) await api.put(`/admin/theatres/${editId}`, payload);
      else await api.post("/admin/theatres", payload);
      toast.success(editId ? "Theatre updated." : "Theatre added.");
      setEditId(""); setForm({ name: "", location: "", address: "", screens: 1 }); await refresh();
    }
    catch (error) { toast.error(error.response?.data?.message || "Couldn’t add theatre."); }
  };
  const remove = async (id) => { try { await api.delete(`/admin/theatres/${id}`); toast.success("Theatre removed."); await refresh(); } catch (error) { toast.error(error.response?.data?.message || "Couldn’t remove theatre."); } };
  const edit = (theatre) => { setEditId(theatre._id); setForm({ name: theatre.name, location: theatre.location, address: theatre.address || "", screens: theatre.screens }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const reset = () => { setEditId(""); setForm({ name: "", location: "", address: "", screens: 1 }); };
  return <div className="admin-content"><form className="admin-form" onSubmit={submit}><h2>{editId ? "Edit a theatre" : "Add a theatre"}</h2><div className="form-grid"><Field label="Venue name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="City / area"><input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field><Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field><Field label="Screens"><input type="number" min="1" value={form.screens} onChange={(e) => setForm({ ...form, screens: e.target.value })} /></Field></div><button className="btn btn-coral">{editId ? "Save changes →" : "Add theatre +"}</button>{editId && <button type="button" className="admin-cancel" onClick={reset}>Cancel</button>}</form>
    <div className="admin-list">{theatres.map((theatre) => <div className="admin-row" key={theatre._id}><span className="admin-row-title">{theatre.name}</span><span>{theatre.location} · {theatre.screens} screens</span><div className="admin-row-actions"><button className="edit-link" onClick={() => edit(theatre)}>Edit</button><button className="danger-link" onClick={() => remove(theatre._id)}>Remove</button></div></div>)}</div></div>;
}

function ShowAdmin({ shows, movies, theatres, refresh }) {
  const initial = { movie: "", theatre: "", startsAt: "", price: 14.5, format: "2D", rows: 6, seatsPerRow: 10 };
  const [form, setForm] = useState(initial);
  const [editId, setEditId] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, price: Number(form.price), rows: Number(form.rows), seatsPerRow: Number(form.seatsPerRow), startsAt: new Date(form.startsAt).toISOString() };
      if (editId) await api.put(`/admin/shows/${editId}`, payload);
      else await api.post("/admin/shows", payload);
      toast.success(editId ? "Showtime updated." : "Showtime scheduled.");
      setEditId(""); setForm(initial); await refresh();
    }
    catch (error) { toast.error(error.response?.data?.message || "Couldn’t schedule showtime."); }
  };
  const remove = async (id) => { try { await api.delete(`/admin/shows/${id}`); toast.success("Showtime removed."); await refresh(); } catch (error) { toast.error(error.response?.data?.message || "Couldn’t remove showtime."); } };
  const edit = (show) => {
    const localDate = new Date(new Date(show.startsAt).getTime() - new Date(show.startsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditId(show._id);
    setForm({ ...initial, movie: show.movie?._id, theatre: show.theatre?._id, startsAt: localDate, price: show.price, format: show.format });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => { setEditId(""); setForm(initial); };
  return <div className="admin-content"><form className="admin-form" onSubmit={submit}><h2>{editId ? "Edit showtime" : "Schedule a showtime"}</h2><div className="form-grid"><Field label="Movie"><select required value={form.movie} onChange={(e) => setForm({ ...form, movie: e.target.value })}><option value="">Choose a movie</option>{movies.map((movie) => <option key={movie._id} value={movie._id}>{movie.title}</option>)}</select></Field><Field label="Theatre"><select required value={form.theatre} onChange={(e) => setForm({ ...form, theatre: e.target.value })}><option value="">Choose a theatre</option>{theatres.map((theatre) => <option key={theatre._id} value={theatre._id}>{theatre.name}</option>)}</select></Field><Field label="Date & time"><input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field><Field label="Price per seat ($)"><input required type="number" min="0" step="0.5" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field><Field label="Format"><select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}><option>2D</option><option>3D</option><option>IMAX</option><option>4DX</option></select></Field>{!editId && <Field label="Seat layout (rows × seats)"><div className="split-input"><input aria-label="Rows" type="number" min="1" max="12" value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} /><span>×</span><input aria-label="Seats per row" type="number" min="1" max="20" value={form.seatsPerRow} onChange={(e) => setForm({ ...form, seatsPerRow: e.target.value })} /></div></Field>}</div><button className="btn btn-coral">{editId ? "Save changes →" : "Schedule show +"}</button>{editId && <button type="button" className="admin-cancel" onClick={reset}>Cancel</button>}</form>
    <div className="admin-list">{shows.map((show) => <div className="admin-row" key={show._id}><span className="admin-row-title">{show.movie?.title}</span><span>{show.theatre?.name} · {prettyDate(show.startsAt)} {prettyTime(show.startsAt)}</span><div className="admin-row-actions"><button className="edit-link" onClick={() => edit(show)}>Edit</button><button className="danger-link" onClick={() => remove(show._id)}>Remove</button></div></div>)}</div></div>;
}

function Field({ label, children }) { return <label className="admin-field"><span>{label}</span>{children}</label>; }

function PrivateRoute({ children, admin = false }) {
  const { user, openAuth } = useSession();
  useEffect(() => { if (!user) openAuth(); }, [user, openAuth]);
  if (!user) return <div className="page-loading"><p>Sign in to continue.</p></div>;
  if (admin && user.role !== "admin") return <div className="page-loading"><p>Administrator access is required.</p><Link to="/">Back home →</Link></div>;
  return children;
}

function AuthModal({ onClose }) {
  const { setAuthenticated } = useSession();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/auth/${mode === "login" ? "login" : "register"}`, form);
      setAuthenticated(data);
      toast.success(mode === "login" ? "Welcome back." : "Your account is ready.");
    } catch (error) { toast.error(error.response?.data?.message || "Couldn’t sign you in."); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop-custom" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="auth-modal"><button className="modal-close" onClick={onClose} aria-label="Close">×</button><div className="brand modal-brand"><span className="brand-mark">i</span>movies<span className="brand-dot">.</span></div>
      <div className="eyebrow muted-eyebrow">{mode === "login" ? "WELCOME BACK" : "YOUR FRONT ROW STARTS HERE"}</div><h2>{mode === "login" ? "Pick up where you left off." : "Let’s make it a night."}</h2><p>{mode === "login" ? "Sign in to find your tickets and favorite seats." : "Create an account to book your first movie night."}</p>
      <form onSubmit={submit}>{mode === "register" && <Field label="Your name"><input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" /></Field>}<Field label="Email address"><input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></Field><Field label="Password"><input required type="password" minLength="8" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></Field><button className="btn btn-coral auth-submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in →" : "Create account →"}</button></form>
      <div className="auth-switch">{mode === "login" ? "New around here?" : "Already have an account?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></div>
    </div>
  </div>;
}

function NotFound() { return <div className="empty-state not-found"><span>404</span><h3>This reel has ended.</h3><p>That page isn’t here, but your next favorite movie might be.</p><Link className="btn btn-coral" to="/">Back to movies →</Link></div>; }

function Footer() { return <footer className="site-footer"><div className="container footer-inner"><Link className="brand" to="/"><span className="brand-mark">i</span>movies<span className="brand-dot">.</span></Link><span>Make a night of it.</span><span>© {new Date().getFullYear()} iMovies</span></div></footer>; }

export default App;
