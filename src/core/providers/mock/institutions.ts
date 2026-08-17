/**
 * Mock institution catalogue.
 *
 * Brand colours and account-type mixes reflect the real Turkish retail banking
 * landscape: Enpara and Papara are digital-only (no branch, no chequing
 * overdraft product), Papara issues prepaid rather than credit, and only the
 * larger incumbents currently expose standing-order cancellation over the AÖH
 * open-banking rails.
 */

import type { Institution } from '../../types';

export const MOCK_INSTITUTIONS: Institution[] = [
  {
    id: 'garanti-bbva',
    provider: 'MOCK',
    displayName: 'Garanti BBVA',
    legalName: 'T. Garanti Bankası A.Ş.',
    brandColor: '#00A94F',
    logoSlug: 'garanti',
    bic: 'TGBATRIS',
    supportsStandingOrderCancellation: true,
    supportsInstantBalance: true,
    historyWindowDays: 730,
    offeredAccountTypes: ['CHECKING', 'CREDIT_CARD', 'SAVINGS'],
  },
  {
    id: 'is-bankasi',
    provider: 'MOCK',
    displayName: 'İş Bankası',
    legalName: 'Türkiye İş Bankası A.Ş.',
    brandColor: '#0B3C8C',
    logoSlug: 'isbank',
    bic: 'ISBKTRIS',
    supportsStandingOrderCancellation: true,
    supportsInstantBalance: true,
    historyWindowDays: 730,
    offeredAccountTypes: ['CHECKING', 'CREDIT_CARD', 'SAVINGS'],
  },
  {
    id: 'yapi-kredi',
    provider: 'MOCK',
    displayName: 'Yapı Kredi',
    legalName: 'Yapı ve Kredi Bankası A.Ş.',
    brandColor: '#004990',
    logoSlug: 'yapikredi',
    bic: 'YAPITRIS',
    supportsStandingOrderCancellation: true,
    supportsInstantBalance: true,
    historyWindowDays: 540,
    offeredAccountTypes: ['CHECKING', 'CREDIT_CARD'],
  },
  {
    id: 'akbank',
    provider: 'MOCK',
    displayName: 'Akbank',
    legalName: 'Akbank T.A.Ş.',
    brandColor: '#E30613',
    logoSlug: 'akbank',
    bic: 'AKBKTRIS',
    supportsStandingOrderCancellation: true,
    supportsInstantBalance: true,
    historyWindowDays: 730,
    offeredAccountTypes: ['CHECKING', 'CREDIT_CARD', 'SAVINGS'],
  },
  {
    id: 'qnb-finansbank',
    provider: 'MOCK',
    displayName: 'QNB Finansbank',
    legalName: 'QNB Finansbank A.Ş.',
    brandColor: '#5C2D91',
    logoSlug: 'qnb',
    bic: 'FNNBTRIS',
    supportsStandingOrderCancellation: false,
    supportsInstantBalance: true,
    historyWindowDays: 365,
    offeredAccountTypes: ['CHECKING', 'CREDIT_CARD'],
  },
  {
    id: 'enpara',
    provider: 'MOCK',
    displayName: 'Enpara.com',
    legalName: 'QNB Finansbank A.Ş. — Enpara.com',
    brandColor: '#7F3F98',
    logoSlug: 'enpara',
    bic: 'FNNBTRIS',
    supportsStandingOrderCancellation: false,
    supportsInstantBalance: true,
    historyWindowDays: 365,
    offeredAccountTypes: ['CHECKING', 'SAVINGS'],
  },
  {
    id: 'papara',
    provider: 'MOCK',
    displayName: 'Papara',
    legalName: 'Papara Elektronik Para A.Ş.',
    brandColor: '#7B2FF7',
    logoSlug: 'papara',
    supportsStandingOrderCancellation: false,
    supportsInstantBalance: true,
    historyWindowDays: 365,
    offeredAccountTypes: ['PREPAID'],
  },
];

export function findInstitution(id: string): Institution | undefined {
  return MOCK_INSTITUTIONS.find((institution) => institution.id === id);
}

/** Turkish display label for an account type. */
export const ACCOUNT_TYPE_LABELS_TR: Record<string, string> = {
  CHECKING: 'Vadesiz Hesap',
  CREDIT_CARD: 'Kredi Kartı',
  PREPAID: 'Ön Ödemeli Kart',
  SAVINGS: 'Vadeli Hesap',
};
