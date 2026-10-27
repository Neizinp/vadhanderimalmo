import { load } from 'cheerio'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EventCategory, EventRecord } from '../src/data/events'

const visitMalmoUrl = 'https://www.visitmalmo.se/evenemang/'
const malmoArenaUrl = 'https://www.malmoarena.com/evenemang?hsLang=sv'
const kulturbolagetFeedUrl = 'https://kulturbolaget.se/feed/?post_type=events'
const malmoLiveUrl = 'https://malmolive.se/program'
const moriskaUrl = 'https://moriskapaviljongen.se/'
const slagthusetApiUrl = 'https://slagthuset.se/api/events'
const malmoCityApi = 'https://malmo.se/appresource/4.50574bcf196ed960a55408d/12.50574bcf196ed960a55409f/items?start='
const pageSize = 18
const outputPath = resolve('src/data/events.json')
const minimumUpcomingEvents = 5
const categories: EventCategory[] = [
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

type CityEvent = {
  id: string
  title: string
  url: string
  image?: string
  dates?: {
    date?: string
    time?: string | null
    sortDateTime?: number
    endSortDateTime?: number
    formatted?: string
    locations?: string[]
  }
  categories?: string[]
  targetGroups?: string[] | null
  place?: string[]
  desc?: string
}

type CityEventPage = {
  count: number
  items: CityEvent[]
}

type SlagthusetEvent = {
  id: number
  slug: string
  link?: string
  title: { rendered: string }
  event_medium?: { url?: string }
  acf?: {
    startdatum?: string
    borjar?: string
    slutdatum?: string
    slutar?: string
    plats?: Array<{ name?: string }>
    status?: { slug?: string }
    pris?: string
  }
}

type KulturcentralenCandidate = {
  title: string
  eventUrl: string
  startsOn: string
  endsOn?: string
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function dateInMalmo(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function localDateTimeFromEpoch(timestamp: number) {
  const date = new Date(timestamp)
  const offsetParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'shortOffset',
  }).formatToParts(date).find((value) => value.type === 'timeZoneName')?.value ?? 'GMT+1'
  const offset = offsetParts.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  const zone = offset ? `${offset[1]}${offset[2].padStart(2, '0')}:${offset[3] ?? '00'}` : '+00:00'
  const wallTime = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`
  return `${wallTime}${zone}`
}

function dateOnlyFromEpoch(timestamp: number) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

function toCategory(value: string): EventCategory {
  const normalized = value.toLocaleLowerCase('sv-SE')
  if (normalized.includes('barn')) return 'Familj'
  if (normalized.includes('sport')) return 'Sport'
  if (normalized.includes('humor')) return 'Humor'
  if (normalized.includes('dans')) return 'Dans'
  if (normalized.includes('mat') || normalized.includes('dryck') || normalized.includes('smak') || normalized.includes('after work')) return 'Mat & dryck'
  if (normalized.includes('konst') || normalized.includes('design') || normalized.includes('utställning')) return 'Konst'
  if (normalized.includes('festival')) return 'Festival'
  if (normalized.includes('marknad') || normalized.includes('mässa')) return 'Marknad'
  if (normalized.includes('musik') || normalized.includes('konsert') || normalized.includes('klubb')) return 'Musik'
  if (normalized.includes('litteratur') || normalized.includes('läsning')) return 'Litteratur'
  if (normalized.includes('workshop') || normalized.includes('skapande')) return 'Workshop'
  if (normalized.includes('natur') || normalized.includes('friluft') || normalized.includes('djur')) return 'Natur'
  if (normalized.includes('fritid') || normalized.includes('guid') || normalized.includes('visning')) return 'Fritid'
  if (normalized.includes('quiz') || normalized.includes('frågesport')) return 'Quiz'
  if (normalized.includes('teater') || normalized.includes('opera') || normalized.includes('film') || normalized.includes('föredrag') || normalized.includes('samtal') || normalized.includes('show') || normalized.includes('performance') || normalized.includes('lärande') || normalized.includes('allsång') || normalized.includes('scen') || normalized.includes('picknick')) return 'Scen'
  return 'Övrigt'
}

function toCategories(value: string): EventCategory[] {
  const mapped = value.split(',').map((category) => toCategory(category.trim()))
  return [...new Set(mapped)]
}

function normalizeUrl(value: string) {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.href.replace(/\/$/, '').toLowerCase()
}

function slug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseDates(value: string) {
  const dates = value.replace(/[\u2010-\u2015\u2212]/g, '-').match(/\d{4}-\d{2}-\d{2}/g)
  if (!dates?.length) return undefined
  if (dates.length > 1 && dates[1] < dates[0]) return undefined
  return { startsAt: dates[0], ...(dates.length > 1 ? { endsAt: dates[1] } : {}) }
}

function stockholmIsoDateTime(date: string, time: string) {
  const utcGuess = new Date(`${date}T${time}:00Z`)
  const offsetText = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'shortOffset',
  }).formatToParts(utcGuess).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+1'
  const offset = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  const zone = offset ? `${offset[1]}${offset[2].padStart(2, '0')}:${offset[3] ?? '00'}` : '+00:00'
  return `${date}T${time}:00${zone}`
}

const swedishMonths: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, mars: 3, mar: 3, april: 4, apr: 4,
  maj: 5, juni: 6, jun: 6, juli: 7, jul: 7, augusti: 8, aug: 8, september: 9,
  sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12,
}

function parseKulturcentralenDates(value: string, listingMonth: string, today: string, lastStartDate: string) {
  const numericDates = [...value.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)]
  const monthDate = value.match(/\b(\d{1,2})\s+([a-zåäö]+)/i)
  const matches = numericDates.length ? numericDates : monthDate ? [monthDate] : []
  if (!matches.length) return undefined

  const listingYear = Number(listingMonth.slice(0, 4))
  const listingMonthNumber = Number(listingMonth.slice(5, 7))
  const parsed = matches.slice(0, 2).map((match) => {
    const day = Number(match[1])
    const month = match.length > 2 ? Number(match[2]) : swedishMonths[match[2].toLocaleLowerCase('sv-SE')]
    if (!month || month < 1 || month > 12 || day < 1 || day > 31) return undefined
    let year = listingYear
    if (month < listingMonthNumber - 6) year += 1
    if (month > listingMonthNumber + 6) year -= 1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })
  if (parsed.some((date) => !date)) return undefined
  const startsAt = parsed[0] as string
  let endsAt = parsed[1] as string | undefined
  if (endsAt && endsAt < startsAt && endsAt.slice(5, 7) < startsAt.slice(5, 7)) {
    endsAt = `${Number(endsAt.slice(0, 4)) + 1}${endsAt.slice(4)}`
  }
  const endDate = endsAt ?? startsAt
  if (endDate < today || startsAt > lastStartDate) return undefined
  return { startsAt, ...(endsAt ? { endsAt } : {}) }
}

function parseLabeledValue($: ReturnType<typeof load>, label: string) {
  const normalizedLabel = label.replace(/\s*:\s*$/, '').trim().toLocaleLowerCase('sv-SE')
  const marker = $('strong').filter((_index, element) => cleanText($(element).text()).replace(/\s*:\s*$/, '').trim().toLocaleLowerCase('sv-SE') === normalizedLabel).first()
  if (!marker.length) return ''
  const parentText = marker.parent().text()
  const markerText = marker.text()
  return cleanText(parentText.replace(markerText, '').replace(/^\s*:\s*/, ''))
}

function isMalmöVenue(value: string) {
  return /,\s*(Malmö|Malmo)(?:\s|,|$)/i.test(value) || /Malmö\s*(Arena|Live|Opera|museum)(?:\s|,|$)/i.test(value)
}

async function fetchKulturcentralenEvents(today: string, lastStartDate: string) {
  const todayMonth = today.slice(0, 7)
  const [year, month] = todayMonth.split('-').map(Number)
  const monthUrls = Array.from({ length: 13 }, (_value, offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1))
    return `https://kulturcentralen.nu/kalendarium/${date.toISOString().slice(0, 7)}`
  })
  const candidates = new Map<string, KulturcentralenCandidate>()

  for (const monthUrl of monthUrls) {
    const response = await fetch(monthUrl, {
      headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Kulturcentralen calendar returned HTTP ${response.status}`)
    const $ = load(await response.text())
    const listingMonth = monthUrl.slice(-7)

    $('.event_listing a[href^="/evenemang/"]').each((_index, anchor) => {
      const eventUrl = new URL($(anchor).attr('href') ?? '', monthUrl).href
      const listingText = cleanText($(anchor).text())
      const dateText = listingText.match(/\b\d{1,2}(?:\/\d{1,2}|\s+[a-zåäö]+)(?:\s*[-–]\s*\d{1,2}(?:\/\d{1,2}|\s+[a-zåäö]+))?/i)?.[0] ?? ''
      const dates = parseKulturcentralenDates(dateText, listingMonth, today, lastStartDate)
      if (!dates) return
      const title = cleanText(listingText.replace(dateText, ''))
      if (!title) return
      candidates.set(eventUrl, { title, eventUrl, ...dates })
    })
  }

  const events: EventRecord[] = []
  for (const candidate of candidates.values()) {
    const response = await fetch(candidate.eventUrl, {
      headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Kulturcentralen event detail returned HTTP ${response.status}`)
    const html = await response.text()
    const $ = load(html)
    const locationText = parseLabeledValue($, 'Plats :')
    if (!isMalmöVenue(locationText)) continue

    const title = candidate.title
    const eventDateText = parseLabeledValue($, 'Datum :')
    const dateMatch = eventDateText.match(/(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)?\s*(\d{1,2})\s+([a-zåäö]+)/i)
    const detailDate = dateMatch ? parseKulturcentralenDates(`${dateMatch[1]} ${dateMatch[2]}`, candidate.startsAt.slice(0, 7), today, lastStartDate)?.startsAt : undefined
    const startsOn = detailDate ?? candidate.startsAt
    const timeText = parseLabeledValue($, 'Tid :').match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]
    const imagePath = $('img[src*="/bilder/preset/event-page/"]').first().attr('src')
    const rawCategories = $('a[href*="/kalendarium/"]').map((_index, link) => cleanText($(link).text())).get()
    const detailOrganizer = $('a[href*="/arrangor/"]').map((_index, link) => cleanText($(link).text())).get().find((name) => name && name !== 'Arrangörer')
    const mappedCategories = [...new Set(rawCategories.map(toCategory))]
    const venue = locationText.split(',')[0].trim()
    const event: EventRecord = {
      id: `kulturcentralen-${slug(candidate.eventUrl)}`,
      title,
      startsAt: timeText ? stockholmIsoDateTime(startsOn, timeText) : startsOn,
      ...(candidate.endsAt ? { endsAt: candidate.endsAt } : {}),
      venue,
      category: mappedCategories[0] ?? toCategory(candidate.title),
      categories: mappedCategories.length ? mappedCategories : [toCategory(candidate.title)],
      ...(parseLabeledValue($, 'Priser :').match(/\d+\s*kr/i)?.[0] ? { price: parseLabeledValue($, 'Priser :').match(/\d+\s*kr/i)?.[0] } : {}),
      imageUrl: imagePath ? new URL(imagePath, candidate.eventUrl).href : 'https://kulturcentralen.nu/bilder/white.png',
      imageAlt: title,
      sourceName: detailOrganizer ?? 'Kulturcentralen',
      sourceUrl: candidate.eventUrl,
      verifiedAt: today,
    }
    if (isEventRecord(event)) events.push(event)
  }
  return events
}

function isEventRecord(value: unknown): value is EventRecord {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<EventRecord>
  return typeof event.id === 'string'
    && typeof event.title === 'string'
    && typeof event.startsAt === 'string'
    && Number.isFinite(Date.parse(event.startsAt))
    && (!event.endsAt || Number.isFinite(Date.parse(event.endsAt)))
    && typeof event.venue === 'string'
    && categories.includes(event.category as EventCategory)
    && typeof event.imageUrl === 'string'
    && event.imageUrl.startsWith('https://')
    && typeof event.sourceUrl === 'string'
    && event.sourceUrl.startsWith('https://')
    && typeof event.sourceName === 'string'
    && typeof event.verifiedAt === 'string'
}

function sameEventData(first: EventRecord, second: EventRecord) {
  const firstData = { ...first }
  const secondData = { ...second }
  delete firstData.verifiedAt
  delete secondData.verifiedAt
  return JSON.stringify(firstData) === JSON.stringify(secondData)
}

function mapCityEvent(item: CityEvent, today: string, lastStartDate: string): EventRecord | undefined {
  const title = cleanText(item.title ?? '')
  const venue = cleanText(item.place?.[0] ?? item.dates?.locations?.[0] ?? '')
  const startsAt = item.dates?.time && typeof item.dates.sortDateTime === 'number'
    ? localDateTimeFromEpoch(item.dates.sortDateTime)
    : item.dates?.date
  const sourcePath = item.url
  const imageUrl = item.image
  if (!title || !venue || !startsAt || !sourcePath || !imageUrl) return undefined

  const startsOn = startsAt.slice(0, 10)
  const endsAt = item.dates?.time && typeof item.dates.endSortDateTime === 'number'
    ? localDateTimeFromEpoch(item.dates.endSortDateTime)
    : typeof item.dates?.endSortDateTime === 'number'
      ? dateOnlyFromEpoch(item.dates.endSortDateTime)
      : undefined
  const endsOn = endsAt?.slice(0, 10) ?? startsOn
  if (endsOn < today || startsOn > lastStartDate) return undefined

  const rawCategories = [...(item.categories ?? [])]
  if ((item.targetGroups ?? []).some((target) => /barn|familj/i.test(target))) {
    rawCategories.push('barn och familj')
  }
  const mappedCategories = [...new Set(rawCategories.map(toCategory))]
  return {
    id: `malmo-stad-${slug(item.id)}`,
    title,
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    venue,
    category: mappedCategories[0] ?? 'Övrigt',
    categories: mappedCategories.length ? mappedCategories : ['Övrigt'],
    imageUrl,
    imageAlt: title,
    sourceName: 'Malmö stad',
    sourceUrl: new URL(sourcePath, 'https://malmo.se').href,
    verifiedAt: today,
  }
}

async function fetchCityEvents(today: string, lastStartDate: string) {
  const events: EventRecord[] = []
  let total = Number.POSITIVE_INFINITY

  for (let start = 0; start < total; start += pageSize) {
    const response = await fetch(`${malmoCityApi}${start}`, {
      headers: {
        'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Malmö City event source returned HTTP ${response.status} at offset ${start}`)

    const page = await response.json() as CityEventPage
    if (!Number.isFinite(page.count) || !Array.isArray(page.items)) {
      throw new Error(`Unexpected Malmö City event response at offset ${start}`)
    }
    total = page.count
    events.push(...page.items.map((item) => mapCityEvent(item, today, lastStartDate)).filter((event): event is EventRecord => Boolean(event)))
    if (!page.items.length && start < total) throw new Error(`Malmö City returned an empty page at offset ${start} of ${total}`)
  }

  if (events.length < minimumUpcomingEvents) {
    throw new Error(`Only ${events.length} valid upcoming events found in Malmö City's calendar`)
  }
  return events
}

async function fetchVisitMalmoEvents(today: string, lastStartDate: string) {
  const response = await fetch(visitMalmoUrl, {
    headers: {
      'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Visit Malmö event source returned HTTP ${response.status}`)
  const $ = load(await response.text())
  const events: EventRecord[] = []

  $('.itemview.event').each((_index, card) => {
    const title = cleanText($(card).find('.event-title').first().text())
    const venue = cleanText($(card).find('.event-description').first().text())
    const dateText = cleanText($(card).find('.event-date').first().text())
    const sourcePath = $(card).find('.event-action a[href]').first().attr('href')
    const imagePath = $(card).find('.event-image img').first().attr('src')
    const categoryText = cleanText($(card).find('.event-category').first().text())
    const dates = parseDates(dateText)

    if (!title || !venue || !sourcePath || !dates) return
    if (dates.endsAt ? dates.endsAt < today : dates.startsAt < today) return
    if (dates.startsAt > lastStartDate) return

    const eventSourceUrl = new URL(sourcePath, visitMalmoUrl).href
    const imageUrl = imagePath ? new URL(imagePath, visitMalmoUrl).href : ''
    const event: EventRecord = {
      id: `${slug(title)}-${dates.startsAt}-${createHash('sha256').update(normalizeUrl(eventSourceUrl)).digest('hex').slice(0, 8)}`,
      title,
      ...dates,
      venue,
      category: toCategory(categoryText.split(',')[0]?.trim() ?? ''),
      categories: toCategories(categoryText),
      imageUrl,
      imageAlt: title,
      sourceName: venue,
      sourceUrl: eventSourceUrl,
      verifiedAt: today,
    }
    if (isEventRecord(event)) events.push(event)
  })
  return events
}

async function fetchMalmoArenaEvents(today: string, lastStartDate: string) {
  const response = await fetch(malmoArenaUrl, {
    headers: {
      'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Malmö Arena event source returned HTTP ${response.status}`)

  const $ = load(await response.text())
  const events: EventRecord[] = []
  let year = 0
  const monthNumbers = new Map(Object.entries(swedishMonths))

  $('.event-listing__heading-year, .event-listing__item').each((_index, element) => {
    const node = $(element)
    if (node.hasClass('event-listing__heading-year')) {
      const headingYear = Number(cleanText(node.text()))
      if (Number.isInteger(headingYear)) year = headingYear
      return
    }

    const title = cleanText(node.find('h2').first().text())
    const dateTimeText = cleanText(node.find('.event-listing__third-block').first().text())
    const dateMatch = dateTimeText.match(/\b(\d{1,2})\s+([a-zåäö]+)\.?/i)
    const time = dateTimeText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]
    const month = dateMatch ? monthNumbers.get(dateMatch[2].toLocaleLowerCase('sv-SE').replace(/\.$/, '')) : undefined
    const day = dateMatch ? Number(dateMatch[1]) : 0
    if (!title || !dateMatch || !month || !year || day < 1 || day > 31) return

    const startsOn = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const parsedDate = new Date(`${startsOn}T00:00:00Z`)
    if (parsedDate.toISOString().slice(0, 10) !== startsOn || startsOn < today || startsOn > lastStartDate) return

    const infoPath = node.find('.event-listing__buttons a[title="Info"]').attr('href')
    if (!infoPath) return
    const sourceUrl = new URL(infoPath, malmoArenaUrl).href
    const imagePath = node.find('.event-listing__img-frame img').attr('src')
    const categoryText = cleanText(node.find('.event-listing__second-block').text())
    const category = /redhawks|sport/i.test(categoryText) ? 'Sport' : toCategory(categoryText)
    const imageUrl = imagePath ? new URL(imagePath, malmoArenaUrl).href : 'https://www.malmoarena.com/hs-fs/hubfs/footer-logo.png'
    const event: EventRecord = {
      id: `malmo-arena-${createHash('sha256').update(normalizeUrl(sourceUrl)).digest('hex').slice(0, 12)}`,
      title,
      startsAt: time ? stockholmIsoDateTime(startsOn, time) : startsOn,
      venue: 'Malmö Arena',
      category,
      categories: [category],
      imageUrl,
      imageAlt: title,
      sourceName: 'Malmö Arena',
      sourceUrl,
      verifiedAt: today,
    }
    if (isEventRecord(event)) events.push(event)
  })

  if (!events.length) throw new Error('Malmö Arena returned no valid upcoming events')
  return events
}

function parseSwedishMonthDay(value: string, today: string) {
  const match = value.match(/\b(\d{1,2})\s+([a-zåäö]+)/i)
  if (!match) return undefined
  const month = swedishMonths[match[2].toLocaleLowerCase('sv-SE').replace(/\.$/, '')]
  const day = Number(match[1])
  if (!month || day < 1 || day > 31) return undefined

  let year = Number(today.slice(0, 4))
  let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (date < today) {
    year += 1
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const parsedDate = new Date(`${date}T00:00:00Z`)
  return parsedDate.toISOString().slice(0, 10) === date ? date : undefined
}

function parseSwedishListingDates(value: string, today: string) {
  const normalized = value.replace(/[\u2010-\u2015\u2212]/g, '-')
  const match = normalized.match(/\b(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s+([a-zåäö]+)\s*,?\s*(\d{4})?/i)
  if (!match) return undefined

  const startDay = Number(match[1])
  const endDay = match[2] ? Number(match[2]) : undefined
  const month = swedishMonths[match[3].toLocaleLowerCase('sv-SE')]
  if (!month || startDay < 1 || startDay > 31 || (endDay && (endDay < startDay || endDay > 31))) return undefined

  let year = Number(match[4] ?? today.slice(0, 4))
  let startsOn = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`
  if (!match[4] && startsOn < today) {
    year += 1
    startsOn = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`
  }
  const endsOn = endDay ? `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}` : undefined
  if (new Date(`${startsOn}T00:00:00Z`).toISOString().slice(0, 10) !== startsOn) return undefined
  if (endsOn && new Date(`${endsOn}T00:00:00Z`).toISOString().slice(0, 10) !== endsOn) return undefined
  return { startsOn, ...(endsOn ? { endsOn } : {}) }
}

async function fetchKulturbolagetEvents(today: string, lastStartDate: string) {
  const feedResponse = await fetch(kulturbolagetFeedUrl, {
    headers: {
      'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)',
      accept: 'application/rss+xml,application/xml,text/xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!feedResponse.ok) throw new Error(`Kulturbolaget RSS returned HTTP ${feedResponse.status}`)

  const feed = load(await feedResponse.text(), { xmlMode: true })
  const candidates = feed('item').toArray().flatMap((item) => {
    const node = feed(item)
    const title = cleanText(node.find('title').first().text())
    const sourceUrl = cleanText(node.find('link').first().text())
    const summary = cleanText(node.find('description').text())
    if (!title || !sourceUrl || !/malm[oö]|\bmlm\b/i.test(`${sourceUrl} ${summary}`)) return []
    return [{ title, sourceUrl }]
  })

  const events: EventRecord[] = []
  for (const candidate of candidates) {
    const response = await fetch(candidate.sourceUrl, {
      headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Kulturbolaget event detail returned HTTP ${response.status}`)
    const $ = load(await response.text())
    const detail = $('.event-template').first()
    const city = cleanText(detail.find('.event-city').first().text())
    if (!/^(malmö|malmo)$/i.test(city)) continue

    const dateText = cleanText(detail.find('.InformationBox__meta-data').first().text())
    const startsOn = parseSwedishMonthDay(dateText, today)
    if (!startsOn || startsOn > lastStartDate) continue
    const timeElements = detail.find('time').map((_index, element) => cleanText($(element).text())).get()
    const startTime = timeElements.at(-1)?.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]
    const locationText = cleanText(detail.find('.InformationBox__meta-data--location').first().text())
    const venue = locationText.replace(/^(?:location_on\s*)+/i, '').split(',')[0].trim()
    const imageUrl = $('meta[property="og:image"]').attr('content')
    const title = cleanText(detail.find('.event-headline').first().text()) || candidate.title
    if (!venue || !imageUrl) continue

    const category = toCategory('konsert')
    const event: EventRecord = {
      id: `kulturbolaget-${createHash('sha256').update(normalizeUrl(candidate.sourceUrl)).digest('hex').slice(0, 12)}`,
      title,
      startsAt: startTime ? stockholmIsoDateTime(startsOn, startTime) : startsOn,
      venue,
      category,
      categories: [category],
      imageUrl: new URL(imageUrl, candidate.sourceUrl).href,
      imageAlt: title,
      sourceName: 'Kulturbolaget',
      sourceUrl: candidate.sourceUrl,
      verifiedAt: today,
    }
    if (isEventRecord(event)) events.push(event)
  }

  if (candidates.length > 0 && !events.length) throw new Error('Kulturbolaget RSS had Malmö candidates but none passed detail-page validation')
  return events
}

async function fetchMoriskaEvents(today: string, lastStartDate: string) {
  const response = await fetch(moriskaUrl, {
    headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Moriska event calendar returned HTTP ${response.status}`)

  const $ = load(await response.text())
  const fallbackImage = $('meta[property="og:image"]').attr('content')
  const candidates: EventRecord[] = []
  $('h3').each((_index, element) => {
    const heading = cleanText($(element).text())
    const dayMonth = heading.match(/\b\d{1,2}\s+[a-zåäö]+/i)?.[0]
    const startsOn = dayMonth ? parseSwedishMonthDay(dayMonth, today) : undefined
    if (!startsOn || startsOn < today || startsOn > lastStartDate) return

    $(element).parent().find('a[href*="/program/"]').each((_linkIndex, anchor) => {
      const link = $(anchor)
      const sourceUrl = link.attr('href')
      const fullText = cleanText(link.text())
      if (!sourceUrl || !fullText) return
      const timeText = cleanText(link.find('em').first().text()).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)
      const startTime = timeText ? `${timeText[1].padStart(2, '0')}:${timeText[2]}` : undefined
      const title = cleanText(fullText.replace(link.find('em').first().text(), ''))
      if (!title) return

      const absoluteUrl = new URL(sourceUrl, moriskaUrl).href
      const category = toCategory(title)
      const event: EventRecord = {
        id: `moriska-${createHash('sha256').update(normalizeUrl(absoluteUrl)).digest('hex').slice(0, 12)}`,
        title,
        startsAt: startTime ? stockholmIsoDateTime(startsOn, startTime) : startsOn,
        venue: 'Moriska Paviljongen',
        district: 'Folkets Park',
        category,
        categories: [category],
        imageUrl: fallbackImage ?? 'https://moriskapaviljongen.se/wp-content/themes/moriskan/library/images/moriskan-logo-black.svg',
        imageAlt: title,
        sourceName: 'Moriska Paviljongen',
        sourceUrl: absoluteUrl,
        verifiedAt: today,
      }
      if (isEventRecord(event)) candidates.push(event)
    })
  })

  if (!candidates.length) throw new Error('Moriska calendar returned no valid upcoming events')
  return candidates
}

async function fetchSlagthusetEvents(today: string, lastStartDate: string) {
  const response = await fetch(slagthusetApiUrl, {
    headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Slagthuset event API returned HTTP ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('Slagthuset returned an unexpected event response')

  const events = (payload as SlagthusetEvent[]).flatMap((item) => {
    const rawDate = item.acf?.startdatum ?? ''
    const startsOn = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : ''
    if (!startsOn || startsOn < today || startsOn > lastStartDate) return []
    if (new Date(`${startsOn}T00:00:00Z`).toISOString().slice(0, 10) !== startsOn) return []

    const title = cleanText(item.title?.rendered ?? '')
    const eventUrl = item.link ?? `https://slagthuset.se/events/${item.slug}`
    const imageUrl = item.event_medium?.url
    const locationName = cleanText(item.acf?.plats?.[0]?.name ?? '')
    if (!title || !imageUrl || !eventUrl) return []
    const venue = locationName === 'Teatern'
      ? 'Slagthusets Teater'
      : locationName && locationName !== 'Slagthuset'
        ? `Slagthuset, ${locationName}`
        : 'Slagthuset'
    const time = item.acf?.borjar?.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    const startTime = time ? `${time[1].padStart(2, '0')}:${time[2]}` : undefined
    const category = toCategory(title)
    const event: EventRecord = {
      id: `slagthuset-${item.id}`,
      title,
      startsAt: startTime ? stockholmIsoDateTime(startsOn, startTime) : startsOn,
      venue,
      district: 'Slagthuset',
      category,
      categories: [category],
      ...(item.acf?.pris ? { price: cleanText(item.acf.pris) } : {}),
      imageUrl,
      imageAlt: title,
      sourceName: 'Slagthuset',
      sourceUrl: new URL(eventUrl, 'https://slagthuset.se').href,
      verifiedAt: today,
    }
    return isEventRecord(event) ? [event] : []
  })

  if (!events.length) throw new Error('Slagthuset API returned no valid upcoming events')
  return events
}

async function fetchMalmoLiveEvents(today: string, lastStartDate: string) {
  const response = await fetch(malmoLiveUrl, {
    headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Malmö Live event page returned HTTP ${response.status}`)

  const $ = load(await response.text())
  const candidates = new Map<string, { title: string; url: string; dateText: string }>()
  $('.views-row--event-listing').each((_index, element) => {
    const row = $(element)
    const link = row.find('a[href^="/program/"]').first()
    const title = cleanText(link.find('h3').first().text())
    const dateText = cleanText(link.find('.event--trending--date').first().text() || row.text().replace(title, ''))
    const path = link.attr('href')
    if (!title || !dateText || !path) return
    const url = new URL(path, malmoLiveUrl).href
    candidates.set(url, { title, url, dateText })
  })

  const events: EventRecord[] = []
  for (const candidate of candidates.values()) {
    const dates = parseSwedishListingDates(candidate.dateText, today)
    if (!dates || dates.startsOn > lastStartDate || (dates.endsOn && dates.endsOn < today)) continue

    const detailResponse = await fetch(candidate.url, {
      headers: { 'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!detailResponse.ok) throw new Error(`Malmö Live event detail returned HTTP ${detailResponse.status}`)
    const detail = load(await detailResponse.text())
    const imageUrl = detail('meta[property="og:image"]').attr('content')
    if (!imageUrl) continue
    const title = cleanText(detail('h1').first().text()) || candidate.title
    const category = toCategory(title) === 'Övrigt' ? 'Scen' : toCategory(title)
    const event: EventRecord = {
      id: `malmo-live-${createHash('sha256').update(normalizeUrl(candidate.url)).digest('hex').slice(0, 12)}`,
      title,
      startsAt: dates.startsOn,
      ...(dates.endsOn ? { endsAt: dates.endsOn } : {}),
      venue: 'Malmö Live Konserthus',
      category,
      categories: [category],
      imageUrl: new URL(imageUrl, candidate.url).href,
      imageAlt: title,
      sourceName: 'Malmö Live',
      sourceUrl: candidate.url,
      verifiedAt: today,
    }
    if (isEventRecord(event)) events.push(event)
  }

  if (!events.length) throw new Error('Malmö Live program page returned no valid upcoming events')
  return events
}

async function main() {
  const today = dateInMalmo(new Date())
  const lastStartDate = addDays(today, 365)
  const sources = [
    {
      name: 'Malmö stad',
      fetch: () => fetchCityEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Malmö stad',
    },
    {
      name: 'Visit Malmö',
      fetch: () => fetchVisitMalmoEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceUrl.includes('visitmalmo.se'),
    },
    {
      name: 'Kulturcentralen',
      fetch: () => fetchKulturcentralenEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceUrl.includes('kulturcentralen.nu'),
    },
    {
      name: 'Malmö Arena',
      fetch: () => fetchMalmoArenaEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Malmö Arena',
    },
    {
      name: 'Kulturbolaget',
      fetch: () => fetchKulturbolagetEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Kulturbolaget',
    },
    {
      name: 'Malmö Live',
      fetch: () => fetchMalmoLiveEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Malmö Live',
    },
    {
      name: 'Moriska Paviljongen',
      fetch: () => fetchMoriskaEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Moriska Paviljongen',
    },
    {
      name: 'Slagthuset',
      fetch: () => fetchSlagthusetEvents(today, lastStartDate),
      matchesPrevious: (event: EventRecord) => event.sourceName === 'Slagthuset',
    },
  ]
  const sourceResults = await Promise.all(sources.map(async (source) => {
    try {
      return { source, events: await source.fetch() }
    } catch (error) {
      return { source, error }
    }
  }))
  const currentEvents: unknown = JSON.parse(await readFile(outputPath, 'utf8'))
  if (!Array.isArray(currentEvents) || !currentEvents.every(isEventRecord)) {
    throw new Error('Current event JSON failed validation; refusing to overwrite it')
  }
  const previousEvents = currentEvents as EventRecord[]
  const cityResult = sourceResults.find((result) => result.source.name === 'Malmö stad')
  const currentCityIds = cityResult && 'events' in cityResult
    ? new Set(cityResult.events.map((event) => event.id))
    : undefined
  const retainedEvents = previousEvents.filter((event) => {
    const startsOn = event.startsAt.slice(0, 10)
    const endsOn = (event.endsAt ?? event.startsAt).slice(0, 10)
    if (event.sourceName === 'Malmö stad' && currentCityIds && !currentCityIds.has(event.id)) return false
    return endsOn >= today && startsOn <= lastStartDate
  })
  const fetchedEvents = sourceResults.flatMap((result) => {
    if ('events' in result) return result.events
    console.error(`${result.source.name} source failed; retaining its previous records: ${result.error instanceof Error ? result.error.message : result.error}`)
    return previousEvents.filter(result.source.matchesPrevious)
  })
  const previousById = new Map(previousEvents.map((event) => [event.id, event]))
  const uniqueEvents = [...new Map([...retainedEvents, ...fetchedEvents].map((event) => [event.id, event])).values()]
    .map((event) => {
      const previous = previousById.get(event.id)
      return previous && sameEventData(previous, event) ? { ...event, verifiedAt: previous.verifiedAt } : event
    })
  if (uniqueEvents.length < minimumUpcomingEvents) {
    throw new Error(`Only ${uniqueEvents.length} valid upcoming events found; refusing to replace the current dataset`)
  }

  const curatedByUrl = new Map<string, EventRecord[]>()
  for (const event of previousEvents) {
    const key = normalizeUrl(event.sourceUrl)
    curatedByUrl.set(key, [...(curatedByUrl.get(key) ?? []), event])
  }
  const mergedEvents = uniqueEvents.map((event) => {
    const curatedMatches = curatedByUrl.get(normalizeUrl(event.sourceUrl)) ?? []
    const curated = curatedMatches.length === 1 ? curatedMatches[0] : undefined
    if (!curated) return event
    const curatedStartDate = curated.startsAt.slice(0, 10)
    const incomingStartDate = event.startsAt.slice(0, 10)
    const incomingEndDate = (event.endsAt ?? event.startsAt).slice(0, 10)
    if (curated.endsAt && curated.endsAt.slice(0, 10) < curatedStartDate) return event
    if (curatedStartDate < incomingStartDate || curatedStartDate > incomingEndDate) return event
    return {
      ...event,
      id: curated.id,
      startsAt: event.startsAt.includes('T') ? curated.startsAt : event.startsAt,
      ...(curated.endsAt ? { endsAt: curated.endsAt } : {}),
      ...(curated.district ? { district: curated.district } : {}),
      ...(curated.price ? { price: curated.price } : {}),
      ...(curated.imageAlt ? { imageAlt: curated.imageAlt } : {}),
    }
  }).filter((event) => {
    const startsOn = event.startsAt.slice(0, 10)
    const endsOn = (event.endsAt ?? event.startsAt).slice(0, 10)
    return endsOn >= today && startsOn <= lastStartDate
  })
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
  const deduplicatedByEvent = new Map<string, EventRecord>()
  const eventKeys = new Map<string, string>()
  for (const event of mergedEvents) {
    const date = event.startsAt.slice(0, 10)
    const venue = slug(event.venue)
    const canonicalKey = `${normalizeUrl(event.sourceUrl)}|${date}`
    const titleKey = `${slug(event.title)}|${venue}|${date}`
    const key = eventKeys.get(canonicalKey) ?? eventKeys.get(titleKey) ?? canonicalKey
    const existing = deduplicatedByEvent.get(key)
    if (!existing) {
      deduplicatedByEvent.set(key, event)
      eventKeys.set(canonicalKey, key)
      eventKeys.set(titleKey, key)
      continue
    }

    const existingHasTime = existing.startsAt.includes('T')
    const incomingHasTime = event.startsAt.includes('T')
    const preferredTitle = event.title.length > existing.title.length ? event.title : existing.title
    const sameSourceListing = existing.sourceName === event.sourceName
      && normalizeUrl(existing.sourceUrl) === normalizeUrl(event.sourceUrl)
    deduplicatedByEvent.set(key, {
      ...existing,
      id: existing.id.startsWith('malmo-stad-') && !event.id.startsWith('malmo-stad-') ? event.id : existing.id,
      ...(sameSourceListing ? {
        title: event.title,
        venue: event.venue,
        category: event.category,
        imageUrl: event.imageUrl,
        imageAlt: event.imageAlt,
        sourceUrl: event.sourceUrl,
      } : { title: preferredTitle }),
      startsAt: existingHasTime || !incomingHasTime ? existing.startsAt : event.startsAt,
      ...(existing.endsAt || !event.endsAt ? {} : { endsAt: event.endsAt }),
      ...(existing.price || !event.price ? {} : { price: event.price }),
      categories: sameSourceListing
        ? event.categories ?? [event.category]
        : [...new Set([...(existing.categories ?? [existing.category]), ...(event.categories ?? [event.category])])],
      ...(existing.district || !event.district ? {} : { district: event.district }),
    })
    eventKeys.set(canonicalKey, key)
    eventKeys.set(titleKey, key)
  }
  const deduplicatedEvents = [...deduplicatedByEvent.values()]
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))

  const temporaryPath = `${outputPath}.tmp`
  const updatedJson = `${JSON.stringify(deduplicatedEvents, null, 2)}\n`
  if (await readFile(outputPath, 'utf8') === updatedJson) {
    console.log(`No event data changes; retained ${deduplicatedEvents.length} upcoming events`)
    return
  }
  await writeFile(temporaryPath, updatedJson, 'utf8')
  await rename(temporaryPath, outputPath)
  const sourceCounts = sourceResults.map((result) => `${result.source.name}: ${'events' in result ? result.events.length : previousEvents.filter(result.source.matchesPrevious).length}`).join(', ')
  console.log(`Updated ${deduplicatedEvents.length} upcoming events (${sourceCounts}; ${mergedEvents.length - deduplicatedEvents.length} duplicate listings removed)`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
