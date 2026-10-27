import { load } from 'cheerio'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EventCategory, EventRecord } from '../src/data/events'

const sourceUrl = 'https://www.visitmalmo.se/evenemang/'
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
  'Övrigt',
]

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function toCategory(value: string): EventCategory {
  const normalized = value.toLocaleLowerCase('sv-SE')
  if (normalized.includes('barn')) return 'Familj'
  if (normalized.includes('sport')) return 'Sport'
  if (normalized.includes('humor')) return 'Humor'
  if (normalized.includes('dans')) return 'Dans'
  if (normalized.includes('mat') || normalized.includes('dryck') || normalized.includes('after work')) return 'Mat & dryck'
  if (normalized.includes('konst') || normalized.includes('design') || normalized.includes('utställning')) return 'Konst'
  if (normalized.includes('marknad') || normalized.includes('festival')) return 'Marknad'
  if (normalized.includes('musik') || normalized.includes('konsert') || normalized.includes('klubb')) return 'Musik'
  if (normalized.includes('teater') || normalized.includes('opera') || normalized.includes('film')) return 'Scen'
  return 'Övrigt'
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

async function main() {
  const response = await fetch(sourceUrl, {
    headers: {
      'user-agent': 'VadHanderIMalmoEventUpdater/1.0 (scheduled event listing)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Event source returned HTTP ${response.status}`)
  const html = await response.text()
  const $ = load(html)
  const today = new Date().toISOString().slice(0, 10)
  const reviewed: EventRecord[] = []

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

    const eventSourceUrl = new URL(sourcePath, sourceUrl).href
    const imageUrl = imagePath ? new URL(imagePath, sourceUrl).href : ''
    const event: EventRecord = {
      id: `${slug(title)}-${dates.startsAt}-${createHash('sha256').update(normalizeUrl(eventSourceUrl)).digest('hex').slice(0, 8)}`,
      title,
      ...dates,
      venue,
      category: toCategory(categoryText),
      imageUrl,
      imageAlt: title,
      sourceName: venue,
      sourceUrl: eventSourceUrl,
      verifiedAt: today,
    }

    if (isEventRecord(event)) reviewed.push(event)
  })

  const uniqueEvents = [...new Map(reviewed.map((event) => [event.id, event])).values()]
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
      startsAt: curated.startsAt,
      ...(curated.endsAt ? { endsAt: curated.endsAt } : {}),
      ...(curated.district ? { district: curated.district } : {}),
      ...(curated.price ? { price: curated.price } : {}),
      ...(curated.imageAlt ? { imageAlt: curated.imageAlt } : {}),
    }
  }).filter((event) => event.endsAt ? event.endsAt >= today : event.startsAt >= today)
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
  const deduplicatedEvents = [...new Map(mergedEvents.map((event) => {
    const key = `${slug(event.title)}|${slug(event.venue)}|${event.startsAt}`
    return [key, event]
  })).values()]

  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(deduplicatedEvents, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, outputPath)
  console.log(`Updated ${deduplicatedEvents.length} upcoming events from ${sourceUrl} (${mergedEvents.length - deduplicatedEvents.length} duplicate listings removed)`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
