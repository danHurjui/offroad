import { NextResponse } from 'next/server'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'

/**
 * Error responses, in the caller's language.
 *
 * Every route used to answer with an English sentence written at the call
 * site, which meant a Romanian user filling in a form got an English
 * complaint back from it. The message now comes from the catalogue under
 * `apiError.<key>`, resolved per request.
 *
 * ## The key travels too
 *
 * The response carries `code` alongside `error`, and the code is this
 * key. That is the half a client can act on: a translated sentence is for
 * a person to read, and a `switch` on prose breaks the moment the wording
 * is improved. Three responses already worked this way — RATE_LIMITED,
 * UPGRADE_REQUIRED, EMAIL_NOT_CONFIGURED — and this generalises it rather
 * than inventing a second convention. A caller passing its own `code`
 * keeps it.
 *
 * ## Status stays at the call site
 *
 * Deliberately not bound to the key. The same failure is a 400 in one
 * route and a 404 in another (a missing collaborator is "not found" to a
 * stranger and "invalid" to the owner), and a table mapping key to status
 * would have to be read to know what a line does.
 */

export type ApiErrorKey =
  | 'deactivated'
  | 'rateLimited'
  | 'bodyNotJson'
  | 'bodyNotObject'
  | 'bodyNullBytes'
  | 'bodyNotMultipart'
  | 'botCheckFailed'
  | 'amountNegative'
  | 'fieldRequired'
  | 'fieldTooLong'
  | 'acquisitionDateRequired'
  | 'adminFieldsLimited'
  | 'alreadyCollaborator'
  | 'alreadyPro'
  | 'alreadyRemoved'
  | 'billingPortalFailed'
  | 'bodyRequired'
  | 'cannotDeactivateAdmin'
  | 'cannotDeactivateSelf'
  | 'checkoutCreateFailed'
  | 'checkoutStartFailed'
  | 'collaboratorIdRequired'
  | 'conditionRatingRange'
  | 'dateRequired'
  | 'displayNameEmpty'
  | 'displayNameRequired'
  | 'donationAmountInvalid'
  | 'editOwnTasksOnly'
  | 'emailInvalid'
  | 'emailNotVerified'
  | 'emailRequired'
  | 'endpointRequired'
  | 'expiryDateRequired'
  | 'fileRequired'
  | 'fileTooLarge'
  | 'collaboratorLimit'
  | 'taskPhotoLimit'
  | 'vehicleLimit'
  | 'foundStatePhotoLimit'
  | 'fuelLitresInvalid'
  | 'fuelOwnOnly'
  | 'fuelTotalInvalid'
  | 'projectTypeInvalid'
  | 'foundStateIntakeFirst'
  | 'foundStateRestorationOnly'
  | 'internalError'
  | 'invalidBody'
  | 'invalidCategoryStatus'
  | 'invalidCondition'
  | 'invalidDate'
  | 'invalidDocumentType'
  | 'invalidExpiryDate'
  | 'invalidPhotoType'
  | 'invalidPlan'
  | 'invalidPreferredMode'
  | 'invalidSignature'
  | 'invalidStatus'
  | 'invalidStatusForType'
  | 'invalidTicketType'
  | 'inviteAlreadyAccepted'
  | 'inviteExpired'
  | 'inviteLimitReached'
  | 'inviteNotFound'
  | 'inviteRevoked'
  | 'inviteTokenMissing'
  | 'inviteWrongEmail'
  | 'jobReportFailed'
  | 'locationRequired'
  | 'makeRequired'
  | 'modelRequired'
  | 'nameEmpty'
  | 'nameRequired'
  | 'noBillingAccount'
  | 'noVinOnFile'
  | 'notACollaborator'
  | 'notFound'
  | 'nothingToUpdate'
  | 'odometerAboveLater'
  | 'odometerBelowEarlier'
  | 'odometerDeleteOwnOnly'
  | 'odometerFuture'
  | 'odometerKmInvalid'
  | 'odometerOverrideInvalid'
  | 'onlyAdminTriage'
  | 'onlyOwnerDeletesTask'
  | 'onlyPendingResend'
  | 'onlyRequester'
  | 'onlyTicketAuthor'
  | 'orderedIdsInvalid'
  | 'orderedIdsMismatch'
  | 'partNameRequired'
  | 'passwordTooShort'
  | 'paymentsUnavailable'
  | 'pdfFailed'
  | 'photoRemoveOwnOnly'
  | 'priceInvalid'
  | 'profileFieldInvalid'
  | 'proPartsRequest'
  | 'proPdfExport'
  | 'proPriceAlerts'
  | 'proShareCards'
  | 'proTrailLog'
  | 'proVinDecoder'
  | 'pushSubscriptionInvalid'
  | 'receiptOwnTasksOnly'
  | 'receiptRemoveOwnOnly'
  | 'registrationFailed'
  | 'resetEmailNotConfigured'
  | 'resetLinkInvalid'
  | 'resetSendFailed'
  | 'resetUrlNotConfigured'
  | 'saveFileFailed'
  | 'savePhotoFailed'
  | 'statusMustBeFound'
  | 'tokenRequired'
  | 'trailOffroadOnly'
  | 'tyreFieldInvalid'
  | 'proServiceBookExport'
  | 'proPassport'
  | 'passportFailed'
  | 'serviceBookFailed'
  | 'valuesFieldInvalid'
  | 'expenseFieldInvalid'
  | 'expenseOwnOnly'
  | 'costFieldInvalid'
  | 'tyreOwnOnly'
  | 'accidentFieldInvalid'
  | 'accidentOwnOnly'
  | 'accidentPhotoLimit'
  | 'orgFieldInvalid'
  | 'orgBetaRequired'
  | 'orgOwnerOnly'
  | 'orgRoleInvalid'
  | 'orgLastOwner'
  | 'orgLastOwnerAccount'
  | 'orgAlreadyMember'
  | 'orgAlreadyInvited'
  | 'orgInviteLimit'
  | 'orgHasVehicles'
  | 'companyVehicleNotPublic'
  | 'vehicleAlreadyCompany'
  | 'orgMoveNotAllowed'
  | 'vehicleNotCompany'
  | 'orgDeleteConfirm'
  | 'assignDriverOnly'
  | 'vehicleAlreadyAssigned'
  | 'assignmentAlreadyEnded'
  | 'handoverStageInvalid'
  | 'handoverPhotoLimit'
  | 'handoverStartRecorded'
  | 'transformationRestorationOnly'
  | 'unauthorized'
  | 'unsupportedFileType'
  | 'unsupportedLanguage'
  | 'validDateRequired'
  | 'vehicleMakeModelRequired'
  | 'vinRestorationOnly'
  | 'webhookFailed'
  | 'webhookNotConfigured'
  | 'wishlistNeedsCategory'
  | 'workshopNameRequired'
  | 'yearInvalid'

/**
 * A JSON error response with the message in the request's language.
 *
 * `await` it: resolving the language means reading a cookie, which is
 * per-request by nature.
 */
export async function apiError(
  key: ApiErrorKey,
  status: number,
  extra?: Record<string, unknown>
): Promise<NextResponse> {
  return NextResponse.json({ error: await apiErrorMessage(key), code: key, ...extra }, { status })
}

/**
 * The same, for the handful of messages that name the field they are
 * about — `costRon must be a non-negative number`. The field name is a
 * value, not a sentence, so it is interpolated rather than translated.
 */
export async function apiErrorWith(
  key: ApiErrorKey,
  values: Record<string, string | number>,
  status: number,
  extra?: Record<string, unknown>
): Promise<NextResponse> {
  const t = await translator(localeFromRequest(), 'apiError')
  return NextResponse.json({ error: t(key, values), code: key, ...extra }, { status })
}

/** Just the sentence, for the places that build their own Response. */
export async function apiErrorMessage(
  key: ApiErrorKey,
  values?: Record<string, string | number>
): Promise<string> {
  const t = await translator(localeFromRequest(), 'apiError')
  return values ? t(key, values) : t(key)
}
