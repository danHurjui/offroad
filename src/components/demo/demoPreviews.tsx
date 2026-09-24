import { getTranslations } from 'next-intl/server'
import DemoScreen from '@/components/demo/DemoScreen'
import DemoModeSwitcher from '@/components/demo/DemoModeSwitcher'
import {
  AnalyticsPreview,
  CardPreview,
  CollaboratorsPreview,
  CostsPreview,
  DataRightsPreview,
  DocumentsPreview,
  FeedPreview,
  FoundStatePreview,
  GaragePreview,
  InstallPreview,
  LanguagePreview,
  OriginalityPreview,
  PartsWantedPreview,
  PdfPreview,
  PhotosPreview,
  PriceAlertPreview,
  PublicBuildPreview,
  RoadmapPreview,
  ShortcutsPreview,
  TasksPreview,
  ThemePreview,
  TrailPreview,
  VinPreview,
  WishlistPreview,
} from '@/components/demo/previews'
import {
  AccidentsPreview,
  FuelPreview,
  ChargingPreview,
  HealthPreview,
  IdentityPreview,
  OdometerPreview,
  OwnershipPreview,
  PassportPreview,
  ReceiptScanPreview,
  ServiceBookPreview,
  TyresPreview,
} from '@/components/demo/recordPreviews'
import {
  DriversPreview,
  FleetBoardPreview,
  FleetCostsPreview,
  FleetReportsPreview,
  OrganizationPreview,
  TripsPreview,
} from '@/components/demo/fleetPreviews'

/**
 * Every chapter's screen for the tour, keyed by chapter id — shared by
 * `/demo` (every panel) and `/demo/[feature]` (one), so a feature's own
 * page cannot show a different screen from its panel in the tour.
 *
 * Framed here rather than inside each preview so the "sample data"
 * caption cannot be forgotten on a new one — a preview that quietly
 * shipped without it would be the only unlabelled invented data on the
 * page, which is the one thing the tour must not do.
 */
export async function demoPreviews(): Promise<Record<string, React.ReactNode>> {
  const t = await getTranslations('demo')
  const label = (id: string) => t(`chapter.${id}.title`)
  const screen = (id: string, body: React.ReactNode) => (
    <DemoScreen label={label(id)}>{body}</DemoScreen>
  )

  return {
    modes: screen('modes', <DemoModeSwitcher />),
    tasks: screen('tasks', <TasksPreview />),
    photos: screen('photos', <PhotosPreview />),
    documents: screen('documents', <DocumentsPreview />),
    costs: screen('costs', <CostsPreview />),
    wishlist: screen('wishlist', <WishlistPreview />),
    foundState: screen('foundState', <FoundStatePreview />),
    jobReport: screen('jobReport', <PdfPreview scope="job" />),
    analytics: screen('analytics', <AnalyticsPreview />),
    collaborators: screen('collaborators', <CollaboratorsPreview />),
    trailLog: screen('trailLog', <TrailPreview />),
    cards: screen('cards', <CardPreview />),
    limits: screen('limits', <GaragePreview />),
    pdfExport: screen('pdfExport', <PdfPreview scope="history" />),
    originality: screen('originality', <OriginalityPreview />),
    vinDecoder: screen('vinDecoder', <VinPreview />),
    priceAlert: screen('priceAlert', <PriceAlertPreview />),
    identity: screen('identity', <IdentityPreview />),
    odometer: screen('odometer', <OdometerPreview />),
    fuel: screen('fuel', <FuelPreview />),
    charging: screen('charging', <ChargingPreview />),
    receiptScan: screen('receiptScan', <ReceiptScanPreview />),
    health: screen('health', <HealthPreview />),
    tyres: screen('tyres', <TyresPreview />),
    ownership: screen('ownership', <OwnershipPreview />),
    serviceBook: screen('serviceBook', <ServiceBookPreview />),
    passport: screen('passport', <PassportPreview />),
    accidents: screen('accidents', <AccidentsPreview />),
    organization: screen('organization', <OrganizationPreview />),
    fleetBoard: screen('fleetBoard', <FleetBoardPreview />),
    fleetCosts: screen('fleetCosts', <FleetCostsPreview />),
    drivers: screen('drivers', <DriversPreview />),
    trips: screen('trips', <TripsPreview />),
    fleetReports: screen('fleetReports', <FleetReportsPreview />),
    publicBuild: screen('publicBuild', <PublicBuildPreview />),
    feed: screen('feed', <FeedPreview />),
    partsWanted: screen('partsWanted', <PartsWantedPreview />),
    roadmap: screen('roadmap', <RoadmapPreview />),
    languages: screen('languages', <LanguagePreview />),
    install: screen('install', <InstallPreview />),
    theme: screen('theme', <ThemePreview />),
    shortcuts: screen('shortcuts', <ShortcutsPreview />),
    yourData: screen('yourData', <DataRightsPreview />),
  }
}
