import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Clock3,
  Heart,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import './EventGuide.css'

type Category = 'Musik' | 'Scen' | 'Mat & dryck' | 'Konst' | 'Familj'
type DateFilter = 'all' | 'today' | 'weekend'

type EventItem = {
  id: string
  title: string
  venue: string
  district: string
  category: Category
  daysAhead: number
  time: string
  price: string
  image: string
  imageAlt: string
}

const categories: Array<'Alla' | Category> = [
  'Alla',
  'Musik',
  'Scen',
  'Mat & dryck',
  'Konst',
  'Familj',
]

const events: EventItem[] = [
  {
    id: 'jazz-i-parken',
    title: 'Jazz i vinterträdgården',
    venue: 'Moriska Paviljongen',
    district: 'Folkets Park',
    category: 'Musik',
    daysAhead: 0,
    time: '19:00',
    price: 'Från 180 kr',
    image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Sångare uppträder på en intim scen',
  },
  {
    id: 'matmarknad',
    title: 'Smaka på Möllan',
    venue: 'Möllevångstorget',
    district: 'Möllevången',
    category: 'Mat & dryck',
    daysAhead: 1,
    time: '11:00',
    price: 'Fri entré',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Mat dukad för en gemensam middag',
  },
  {
    id: 'blackbox',
    title: 'Allt det där vi inte sa',
    venue: 'Inkonst',
    district: 'Möllevången',
    category: 'Scen',
    daysAhead: 2,
    time: '20:00',
    price: '120 kr',
    image: 'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Teaterscen i varmt scenljus',
  },
  {
    id: 'form-design',
    title: 'Form/Design Center: öppet hus',
    venue: 'Form/Design Center',
    district: 'Lilla Torg',
    category: 'Konst',
    daysAhead: 3,
    time: '12:00',
    price: 'Fri entré',
    image: 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Färgstarka verk på ett konstgalleri',
  },
  {
    id: 'klubb-kb',
    title: 'Klubb: hela huset dansar',
    venue: 'Plan B',
    district: 'Norra Grängesbergsgatan',
    category: 'Musik',
    daysAhead: 4,
    time: '22:00',
    price: 'Från 100 kr',
    image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Publik dansar framför ett färgstarkt ljusspel',
  },
  {
    id: 'familjesondag',
    title: 'Skapa tillsammans: färg & form',
    venue: 'Malmö Konsthall',
    district: 'Triangeln',
    category: 'Familj',
    daysAhead: 5,
    time: '13:00',
    price: 'Fri entré',
    image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Målarfärger och penslar i en kreativ verkstad',
  },
]

function dateFor(daysAhead: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + daysAhead)
  return date
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date).replace('.', '')
}

function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'Alla' | Category>('Alla')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [savedOnly, setSavedOnly] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('malmo-saved-events') ?? '[]') as string[]
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('malmo-saved-events', JSON.stringify(savedIds))
  }, [savedIds])

  const visibleEvents = events.filter((event) => {
    const searchText = `${event.title} ${event.venue} ${event.district} ${event.category}`.toLocaleLowerCase('sv-SE')
    const eventDate = dateFor(event.daysAhead)
    const day = eventDate.getDay()
    const matchesDate = dateFilter === 'all'
      || (dateFilter === 'today' && event.daysAhead === 0)
      || (dateFilter === 'weekend' && (day === 0 || day === 6))

    return searchText.includes(query.toLocaleLowerCase('sv-SE'))
      && (category === 'Alla' || event.category === category)
      && matchesDate
      && (!savedOnly || savedIds.includes(event.id))
  })

  function toggleSaved(id: string) {
    setSavedIds((current) => current.includes(id)
      ? current.filter((savedId) => savedId !== id)
      : [...current, id])
  }

  function clearFilters() {
    setQuery('')
    setCategory('Alla')
    setDateFilter('all')
    setSavedOnly(false)
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Vad händer i Malmö, till startsidan">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span className="wordmark-name">Vad händer <span>i Malmö</span></span>
        </a>
        <nav className="top-nav" aria-label="Huvudmeny">
          <a className="nav-link active" href="#events">Evenemang</a>
          <a className="nav-link" href="#about">Om guiden</a>
        </nav>
        <button
          className={`saved-toggle ${savedOnly ? 'is-active' : ''}`}
          type="button"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((current) => !current)}
        >
          <Bookmark size={17} strokeWidth={1.8} />
          <span>Sparade</span>
          <span className="saved-count">{savedIds.length}</span>
        </button>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> MALMÖ, JUST NU</p>
            <h1 id="page-title">Det händer<br /><em>i Malmö.</em></h1>
            <p className="intro-description">En stad full av små och stora planer.<br className="desktop-break" /> Hitta något att se fram emot.</p>
          </div>
          <div className="intro-stamp" aria-label={`${events.length} evenemang att upptäcka`}>
            <CalendarDays size={21} strokeWidth={1.6} />
            <strong>{events.length.toString().padStart(2, '0')}</strong>
            <span>utvalda<br />evenemang</span>
            <span className="stamp-spark" aria-hidden="true">✳</span>
          </div>
          <div className="intro-scribble" aria-hidden="true">✳</div>
        </section>

        <section className="event-section" id="events" aria-labelledby="events-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow section-eyebrow">DIN NÄSTA PLAN</p>
              <h2 id="events-heading">På gång i stan <span className="heading-star">✳</span></h2>
            </div>
            <p className="demo-note"><span /> Exempel på evenemang</p>
          </div>

          <div className="filter-panel">
            <label className="search-box">
              <Search size={19} strokeWidth={1.8} aria-hidden="true" />
              <span className="visually-hidden">Sök evenemang, plats eller område</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök evenemang, plats eller område"
              />
              {query && (
                <button className="clear-search" type="button" aria-label="Rensa sökning" onClick={() => setQuery('')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="date-filter" role="group" aria-label="Filtrera efter datum">
              <SlidersHorizontal size={17} strokeWidth={1.8} aria-hidden="true" />
              {([
                ['all', 'Alla datum'],
                ['today', 'Idag'],
                ['weekend', 'I helgen'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={dateFilter === value ? 'date-chip is-selected' : 'date-chip'}
                  aria-pressed={dateFilter === value}
                  onClick={() => setDateFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="category-row" role="group" aria-label="Filtrera efter kategori">
            {categories.map((item) => (
              <button
                className={`category-chip ${category === item ? 'is-selected' : ''}`}
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
            <span className="results-count">{visibleEvents.length} {visibleEvents.length === 1 ? 'träff' : 'träffar'}</span>
          </div>

          {visibleEvents.length > 0 ? (
            <div className="event-grid">
              {visibleEvents.map((event) => {
                const isSaved = savedIds.includes(event.id)
                const date = dateFor(event.daysAhead)

                return (
                  <article className="event-card" key={event.id}>
                    <div className="event-image-wrap">
                      <img className="event-image" src={event.image} alt={event.imageAlt} loading="lazy" />
                      <span className={`event-category category-${event.category.toLowerCase().replaceAll(' ', '-').replaceAll('&', 'och')}`}>
                        {event.category}
                      </span>
                      <span className="event-date">{formatDate(date)}</span>
                      <button
                        className={`save-event ${isSaved ? 'is-saved' : ''}`}
                        type="button"
                        aria-label={isSaved ? `Ta bort ${event.title} från sparade` : `Spara ${event.title}`}
                        aria-pressed={isSaved}
                        onClick={() => toggleSaved(event.id)}
                      >
                        <Heart size={19} strokeWidth={1.8} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="event-content">
                      <div className="event-meta"><Clock3 size={14} /> <span>{event.time}</span><span className="meta-divider">·</span><span>{event.price}</span></div>
                      <h3>{event.title}</h3>
                      <p className="event-location"><MapPin size={15} strokeWidth={1.8} /><span>{event.venue}</span><span className="location-district">· {event.district}</span></p>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><Search size={22} /></span>
              <h3>{savedOnly && savedIds.length === 0 ? 'Inget sparat ännu' : 'Inga träffar den här gången'}</h3>
              <p>{savedOnly && savedIds.length === 0 ? 'Tryck på hjärtat vid ett evenemang för att spara det här.' : 'Prova att ändra sökningen eller välj en annan kategori.'}</p>
              <button type="button" className="reset-button" onClick={clearFilters}>Visa alla evenemang</button>
            </div>
          )}
        </section>

        <section className="about-strip" id="about">
          <span className="about-mark" aria-hidden="true">M</span>
          <div><h2>Staden är din scen.</h2><p>En samlad guide till allt fint, kul och oväntat som händer i Malmö.</p></div>
          <a href="#top" className="back-to-top">Till toppen <ArrowUpRight size={17} /></a>
        </section>
      </main>

      <footer className="footer">
        <span>Vad händer i Malmö? <span className="footer-dot">✳</span></span>
        <span>Lokala tips, stora upplevelser.</span>
      </footer>
    </div>
  )
}

export default App