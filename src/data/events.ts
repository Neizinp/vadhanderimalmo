export type EventCategory =
  | 'Musik'
  | 'Scen'
  | 'Mat & dryck'
  | 'Konst'
  | 'Familj'
  | 'Humor'
  | 'Dans'
  | 'Sport'
  | 'Marknad'

export type EventRecord = {
  id: string
  title: string
  startsAt: string
  endsAt?: string
  venue: string
  district?: string
  category: EventCategory
  price?: string
  imageUrl: string
  imageAlt: string
  sourceName: string
  sourceUrl: string
  verifiedAt: string
}

export const eventRecords: EventRecord[] = [
  {
    id: 'john-achkar-feena-nehke-2026-10-28',
    title: 'John Achkar: Feena Nehke?',
    startsAt: '2026-10-28T19:30:00+01:00',
    venue: 'Moriska Paviljongen',
    district: 'Folkets Park',
    category: 'Humor',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/john_achkar_20260918_153135.png',
    imageAlt: 'John Achkar uppträder med sin standupföreställning',
    sourceName: 'Moriska Paviljongen',
    sourceUrl: 'https://moriskapaviljongen.se/program/johnachkar28okt/',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'afterlife-2026-10-29',
    title: 'Afterlife',
    startsAt: '2026-10-29T19:00:00+01:00',
    venue: 'Skånes Dansteater',
    district: 'Västra Hamnen',
    category: 'Scen',
    price: '160–320 kr',
    imageUrl: 'https://www.skanesdansteater.se/sites/default/files/styles/media_tablet_1x/public/2026-10/WEB_Afterlife_6938-F_photo_Florian-Hetz.jpg?itok=ZpTR0sKQ',
    imageAlt: 'Dansare i föreställningen Afterlife',
    sourceName: 'Skånes Dansteater',
    sourceUrl: 'https://www.skanesdansteater.se/afterlife',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'benjamin-ingrosso-2026-10-30',
    title: 'Benjamin Ingrosso: What Happens Next?',
    startsAt: '2026-10-30T19:30:00+01:00',
    venue: 'Malmö Arena',
    district: 'Hyllie',
    category: 'Musik',
    price: 'Från 680 kr',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/benjaminingrosso2026_promospot_400x400px_malmoarena_20260924_094008.jpg',
    imageAlt: 'Benjamin Ingrosso på scen under What Happens Next?-turnén',
    sourceName: 'Malmö Arena',
    sourceUrl: 'https://www.malmoarena.com/evenemang/benjamin-ingrosso-what-happens-next?hslang=sv',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'elvis-elvis-elvis-2026-10-30',
    title: 'Elvis, Elvis, Elvis!',
    startsAt: '2026-10-30T19:30:00+01:00',
    venue: 'Slagthusets Teater',
    district: 'Slagthuset',
    category: 'Musik',
    price: '595 kr',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/elvis,_elvis,_elvis!_20260518_121758.jpg',
    imageAlt: 'Affisch för Elvis, Elvis, Elvis! på Slagthuset',
    sourceName: 'Slagthuset',
    sourceUrl: 'https://slagthuset.se/events/elvis-elvis-elvis-2026',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'hip-hop-weekend-2026-10-30',
    title: 'Hip Hop Weekend',
    startsAt: '2026-10-30T14:00:00+01:00',
    venue: 'Moriska Paviljongen',
    district: 'Folkets Park',
    category: 'Dans',
    price: '150 kr',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/hip_hop_weekend_1_20260918_153247.png',
    imageAlt: 'Dansare under Hip Hop Weekend',
    sourceName: 'Moriska Paviljongen',
    sourceUrl: 'https://moriskapaviljongen.se/program/hip-hop-weekend-30-okt-2026/',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'hip-hop-weekend-2026-10-31',
    title: 'Hip Hop Weekend',
    startsAt: '2026-10-31T13:30:00+01:00',
    venue: 'Moriska Paviljongen',
    district: 'Folkets Park',
    category: 'Dans',
    price: '250 kr',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/hip_hop_weekend_2_20260918_153556.png',
    imageAlt: 'Dansare under Hip Hop Weekend',
    sourceName: 'Moriska Paviljongen',
    sourceUrl: 'https://moriskapaviljongen.se/program/hip-hop-weekend-31-okt-2026/',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'soullinedance-2026-11-02',
    title: 'SOULlinedance',
    startsAt: '2026-11-02T17:00:00+01:00',
    endsAt: '2026-11-02T18:30:00+01:00',
    venue: 'Moriska Paviljongen',
    district: 'Folkets Park',
    category: 'Dans',
    price: '50 kr + serviceavgift',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/soullinedance_20260918_153804.png',
    imageAlt: 'SOULlinedance på Moriska Paviljongen',
    sourceName: 'Moriska Paviljongen',
    sourceUrl: 'https://moriskapaviljongen.se/program/soullinedance2nov2026/',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'afterlife-relaxed-2026-11-06',
    title: 'Afterlife: Relaxed performance',
    startsAt: '2026-11-06T13:00:00+01:00',
    venue: 'Skånes Dansteater',
    district: 'Västra Hamnen',
    category: 'Scen',
    price: '140 kr',
    imageUrl: 'https://www.skanesdansteater.se/sites/default/files/styles/hero_tablet_1x/public/2026-05/WEB_Afterlife_16x9_photo_Carl-Johan-F-Karlidag.jpg?itok=P81PxjIq',
    imageAlt: 'Dansare i föreställningen Afterlife',
    sourceName: 'Skånes Dansteater',
    sourceUrl: 'https://www.skanesdansteater.se/relaxed-performance-afterlife',
    verifiedAt: '2026-10-27',
  },
  {
    id: 'kardborreshowen-2026-11-07',
    title: 'Kardborreshowen med Per Andersson',
    startsAt: '2026-11-07T19:30:00+01:00',
    venue: 'Slagthusets Teater',
    district: 'Slagthuset',
    category: 'Humor',
    price: 'Från 495 kr',
    imageUrl: 'https://www.visitmalmo.se/Upload/Article/kardborreshowen_per_andersson_20260518_121918.jpg',
    imageAlt: 'Per Andersson i Kardborreshowen',
    sourceName: 'Slagthuset',
    sourceUrl: 'https://slagthuset.se/events/kardborreshowen',
    verifiedAt: '2026-10-27',
  },
]
