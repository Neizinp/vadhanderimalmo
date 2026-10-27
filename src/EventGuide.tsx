import { useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import eventRecords from './data/events.json'
import type { EventCategory, EventRecord } from './data/events'
import './EventGuide.css'

type DateFilter = 'all' | 'today' | 'weekend'

const categories: Array<'Alla' | EventCategory> = [
  'Alla',
  'Musik',
  'Scen',
  'Mat & dryck',
  'Konst',
  'Familj',
  'Humor',
  'Dans',
  'Sport',
  'Marknad',
  'Festival',
  'Litteratur',
  'Workshop',
  'Natur',
  'Fritid',
  'Quiz',
  'Övrigt',
]

const events = [...eventRecords as EventRecord[]].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))

const malmoDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dateKey(date: Date) {
  return malmoDateFormatter.format(date)
}

function addDaysToDateKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function eventDateKey(dateTime: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateTime)
    ? dateTime
    : dateKey(new Date(dateTime))
}

function getWeekendRange(now: Date): [string, string] {
  const today = dateKey(now)
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Europe/Stockholm',
  }).format(now)

  if (weekday === 'Sun') return [today, today]
  if (weekday === 'Sat') return [today, addDaysToDateKey(today, 1)]

  const weekdayNumber = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
  const daysUntilFriday = (5 - weekdayNumber + 7) % 7
  const start = addDaysToDateKey(today, daysUntilFriday)
  return [start, addDaysToDateKey(start, 2)]
}

function formatDate(dateTime: string, currentYear: string) {
  const year = eventDateKey(dateTime).slice(0, 4)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateTime)
    ? new Date(`${dateTime}T12:00:00Z`)
    : new Date(dateTime)
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(year !== currentYear ? { year: 'numeric' as const } : {}),
    timeZone: 'Europe/Stockholm',
  }).format(date).replaceAll('.', '')
}

function formatTime(dateTime: string) {
  if (!dateTime.includes('T')) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(dateTime))
}

function formatEventDate(event: EventRecord, currentYear: string) {
  const start = formatDate(event.startsAt, currentYear)
  if (!event.endsAt || eventDateKey(event.startsAt) === eventDateKey(event.endsAt)) {
    return start
  }
  return `${start}–${formatDate(event.endsAt, currentYear)}`
}

function App() {
  const categoryScroller = useRef<HTMLDivElement>(null)
  const [categoryScroll, setCategoryScroll] = useState({ left: false, right: false })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'Alla' | EventCategory>('Alla')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [todayKey] = useState(() => dateKey(new Date()))
  const currentYear = todayKey.slice(0, 4)
  const [weekendRange] = useState<[string, string]>(() => getWeekendRange(new Date()))
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

  useEffect(() => {
    const element = categoryScroller.current
    if (!element) return

    const updateScrollState = () => {
      setCategoryScroll({
        left: element.scrollLeft > 0,
        right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      })
    }
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(element)
    element.addEventListener('scroll', updateScrollState, { passive: true })
    updateScrollState()

    return () => {
      resizeObserver.disconnect()
      element.removeEventListener('scroll', updateScrollState)
    }
  }, [])

  function scrollCategories(distance: number) {
    const element = categoryScroller.current
    if (!element) return
    element.scrollBy({ left: distance, behavior: 'instant' })
    setCategoryScroll({
      left: element.scrollLeft > 0,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    })
  }

  const visibleEvents = events.filter((event) => {
    const searchText = `${event.title} ${event.venue} ${event.district ?? ''} ${event.category} ${event.sourceName}`.toLocaleLowerCase('sv-SE')
    const startsOn = eventDateKey(event.startsAt)
    const endsOn = event.endsAt ? eventDateKey(event.endsAt) : startsOn
    const matchesDate = dateFilter === 'all'
      || (dateFilter === 'today' && startsOn <= todayKey && endsOn >= todayKey)
      || (dateFilter === 'weekend' && startsOn <= weekendRange[1] && endsOn >= weekendRange[0])

    return searchText.includes(query.toLocaleLowerCase('sv-SE'))
      && (category === 'Alla' || (event.categories ?? [event.category]).includes(category))
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
        <section className="event-section" id="events" aria-label="Evenemang">
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

          <div className="category-row">
            <button
              className="category-scroll-button"
              type="button"
              aria-label="Visa tidigare kategorier"
              disabled={!categoryScroll.left}
              onClick={() => scrollCategories(-220)}
            >
              <ChevronLeft size={17} />
            </button>
            <div className="category-viewport" ref={categoryScroller} role="group" aria-label="Filtrera efter kategori">
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
            </div>
            <button
              className="category-scroll-button"
              type="button"
              aria-label="Visa fler kategorier"
              disabled={!categoryScroll.right}
              onClick={() => scrollCategories(220)}
            >
              <ChevronRight size={17} />
            </button>
            <span className="results-count">{visibleEvents.length} {visibleEvents.length === 1 ? 'träff' : 'träffar'}</span>
          </div>

          {visibleEvents.length > 0 ? (
            <div className="event-grid">
              {visibleEvents.map((event) => {
                const isSaved = savedIds.includes(event.id)

                return (
                  <article className="event-card" key={event.id}>
                    <div className="event-image-wrap">
                      <img className="event-image" src={event.imageUrl} alt={event.imageAlt} loading="lazy" />
                      <span className={`event-category category-${event.category.toLowerCase().replaceAll(' ', '-').replaceAll('&', 'och')}`}>
                        {event.category}
                      </span>
                      <span className="event-date">{formatEventDate(event, currentYear)}</span>
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
                      <div className="event-meta">{formatTime(event.startsAt) && <><Clock3 size={14} /><span>{formatTime(event.startsAt)}</span></>}{event.price && <><span className="meta-divider">·</span><span>{event.price}</span></>}</div>
                      <h3><a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.title}</a></h3>
                      <p className="event-location"><MapPin size={15} strokeWidth={1.8} /><span>{event.venue}</span>{event.district && <span className="location-district">· {event.district}</span>}</p>
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

      </main>

    </div>
  )
}

export default App