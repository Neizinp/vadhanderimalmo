import { load } from 'cheerio'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EventCategory, EventRecord } from '../src/data/events'

const visitMalmoUrl = 'https://www.visitmalmo.se/evenemang/'
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

  const rawCategories = [...(item.categories ?? []), ...(item.targetGroups ?? [])]
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

async function main() {
  const today = dateInMalmo(new Date())
  const lastStartDate = addDays(today, 365)
  const [cityEvents, visitEvents, kulturcentralenEvents] = await Promise.all([
    fetchCityEvents(today, lastStartDate),
    fetchVisitMalmoEvents(today, lastStartDate),
    fetchKulturcentralenEvents(today, lastStartDate),
  ])
  const uniqueEvents = [...new Map([...cityEvents, ...visitEvents, ...kulturcentralenEvents].map((event) => [event.id, event])).values()]
  if (uniqueEvents.length < minimumUpcomingEvents) {
    throw new Error(`Only ${uniqueEvents.length} valid upcoming events found; refusing to replace the current dataset`)
  }

  const currentEvents: unknown = JSON.parse(await readFile(outputPath, 'utf8'))
  if (!Array.isArray(currentEvents) || !currentEvents.every(isEventRecord)) {
    throw new Error('Current event JSON failed validation; refusing to overwrite it')
  }
  const curatedByUrl = new Map<string, EventRecord[]>()
  for (const event of currentEvents as EventRecord[]) {
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
    const canonicalKey = `${normalizeUrl(event.sourceUrl)}|${venue}|${date}`
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
    deduplicatedByEvent.set(key, {
      ...existing,
      id: existing.id.startsWith('malmo-stad-') && !event.id.startsWith('malmo-stad-') ? event.id : existing.id,
      title: preferredTitle,
      startsAt: existingHasTime || !incomingHasTime ? existing.startsAt : event.startsAt,
      ...(existing.endsAt || !event.endsAt ? {} : { endsAt: event.endsAt }),
      ...(existing.price || !event.price ? {} : { price: event.price }),
      categories: [...new Set([...(existing.categories ?? [existing.category]), ...(event.categories ?? [event.category])])],
      ...(existing.district || !event.district ? {} : { district: event.district }),
    })
    eventKeys.set(canonicalKey, key)
    eventKeys.set(titleKey, key)
  }
  const deduplicatedEvents = [...deduplicatedByEvent.values()]
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))

  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(deduplicatedEvents, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, outputPath)
  console.log(`Updated ${deduplicatedEvents.length} upcoming events: ${cityEvents.length} from Malmö City, ${visitEvents.length} from Visit Malmö, ${kulturcentralenEvents.length} from Kulturcentralen (${mergedEvents.length - deduplicatedEvents.length} duplicate listings removed)`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
