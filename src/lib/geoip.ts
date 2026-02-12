// src/lib/geoip.ts - Определение геолокации, timezone и языка по IP

interface GeoIPResponse {
    country: string;
    countryCode: string;
    region: string;
    city: string;
    timezone: string;
    languages: string[];
    latitude: number;
    longitude: number;
}

/**
 * Получить геолокацию и timezone по IP адресу через прокси
 */
export async function getGeoIPInfo(proxyIP?: string): Promise<GeoIPResponse | null> {
    // Определяем timezone и язык по коду страны из IP
    const extractCountryFromIP = (ip: string): string | null => {
        // Простая эвристика для определения страны по IP диапазонам
        const firstOctet = parseInt(ip.split('.')[0] || '0');
        // Это упрощенная версия - в реальности нужна база данных IP диапазонов
        return null;
    };

    try {
        console.log('[GeoIP] Запрос геолокации для IP:', proxyIP || 'текущий');

        // Попытка 1: ip-api.com (без HTTPS, быстрее)
        try {
            const url1 = proxyIP
                ? `http://ip-api.com/json/${proxyIP}?fields=status,country,countryCode,region,regionName,city,timezone,lat,lon`
                : 'http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,timezone,lat,lon';

            console.log('[GeoIP] Попытка 1: ip-api.com');
            const response1 = await fetch(url1, {
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 секунд таймаут
            });

            if (response1.ok) {
                const data = await response1.json();

                if (data.status !== 'fail') {
                    const languages = getLanguagesByCountry(data.countryCode);

                    const result: GeoIPResponse = {
                        country: data.country || 'Unknown',
                        countryCode: data.countryCode || 'XX',
                        region: data.regionName || data.region || '',
                        city: data.city || '',
                        timezone: data.timezone || 'UTC',
                        languages,
                        latitude: data.lat || 0,
                        longitude: data.lon || 0,
                    };

                    return result;
                }
            }
        } catch (err1) {
            // ip-api.com недоступен
        }

        // Попытка 2: ipapi.co
        try {
            const url2 = proxyIP
                ? `https://ipapi.co/${proxyIP}/json/`
                : 'https://ipapi.co/json/';

            console.log('[GeoIP] Попытка 2: ipapi.co');
            const response2 = await fetch(url2, {
                method: 'GET',
                headers: { 'User-Agent': 'AEZAKMI-Antidetect/2.0' },
                signal: AbortSignal.timeout(5000)
            });

            if (response2.ok) {
                const data = await response2.json();

                if (!data.error) {
                    const languages = getLanguagesByCountry(data.country_code || data.country);

                    const result: GeoIPResponse = {
                        country: data.country_name || data.country || 'Unknown',
                        countryCode: data.country_code || data.country || 'XX',
                        region: data.region || '',
                        city: data.city || '',
                        timezone: data.timezone || 'UTC',
                        languages,
                        latitude: parseFloat(data.latitude) || 0,
                        longitude: parseFloat(data.longitude) || 0,
                    };

                    console.log('[GeoIP] ✅ Успешно (ipapi.co):', result);
                    return result;
                }
            }
        } catch (err2) {
            console.warn('[GeoIP] ipapi.co недоступен:', err2);
        }

        // Попытка 3: ipinfo.io
        try {
            const url3 = proxyIP
                ? `https://ipinfo.io/${proxyIP}/json`
                : 'https://ipinfo.io/json';

            console.log('[GeoIP] Попытка 3: ipinfo.io');
            const response3 = await fetch(url3, {
                signal: AbortSignal.timeout(5000)
            });

            if (response3.ok) {
                const data = await response3.json();

                const languages = getLanguagesByCountry(data.country);
                const [lat, lon] = (data.loc || '0,0').split(',').map(parseFloat);

                const result: GeoIPResponse = {
                    country: data.country || 'Unknown',
                    countryCode: data.country || 'XX',
                    region: data.region || '',
                    city: data.city || '',
                    timezone: data.timezone || 'UTC',
                    languages,
                    latitude: lat || 0,
                    longitude: lon || 0,
                };

                return result;
            }
        } catch (err3) {
            // ipinfo.io недоступен
        }

        return null;

    } catch (error: any) {
        return null;
    }
}

/**
 * Определить язык на основе страны
 */
function getLanguagesByCountry(countryCode: string): string[] {
    const languageMap: { [key: string]: string[] } = {
        // Европа
        'RU': ['ru-RU', 'ru'],
        'UA': ['uk-UA', 'uk', 'ru-RU', 'ru'],
        'BY': ['be-BY', 'be', 'ru-RU', 'ru'],
        'KZ': ['kk-KZ', 'kk', 'ru-RU', 'ru'],
        'GB': ['en-GB', 'en'],
        'US': ['en-US', 'en'],
        'DE': ['de-DE', 'de'],
        'FR': ['fr-FR', 'fr'],
        'ES': ['es-ES', 'es'],
        'IT': ['it-IT', 'it'],
        'PT': ['pt-PT', 'pt'],
        'PL': ['pl-PL', 'pl'],
        'NL': ['nl-NL', 'nl'],
        'SE': ['sv-SE', 'sv'],
        'NO': ['no-NO', 'no'],
        'DK': ['da-DK', 'da'],
        'FI': ['fi-FI', 'fi'],
        'CZ': ['cs-CZ', 'cs'],
        'GR': ['el-GR', 'el'],
        'TR': ['tr-TR', 'tr'],

        // Азия
        'CN': ['zh-CN', 'zh'],
        'JP': ['ja-JP', 'ja'],
        'KR': ['ko-KR', 'ko'],
        'IN': ['hi-IN', 'hi', 'en-IN', 'en'],
        'TH': ['th-TH', 'th'],
        'VN': ['vi-VN', 'vi'],
        'ID': ['id-ID', 'id'],
        'MY': ['ms-MY', 'ms'],
        'SG': ['en-SG', 'en', 'zh-CN', 'zh'],
        'PH': ['en-PH', 'en'],
        'AE': ['ar-AE', 'ar', 'en-US', 'en'],
        'SA': ['ar-SA', 'ar'],
        'IL': ['he-IL', 'he', 'en-US', 'en'],

        // Америка
        'CA': ['en-CA', 'en', 'fr-CA', 'fr'],
        'MX': ['es-MX', 'es'],
        'BR': ['pt-BR', 'pt'],
        'AR': ['es-AR', 'es'],
        'CL': ['es-CL', 'es'],
        'CO': ['es-CO', 'es'],

        // Африка
        'ZA': ['en-ZA', 'en'],
        'EG': ['ar-EG', 'ar'],
        'NG': ['en-NG', 'en'],

        // Океания
        'AU': ['en-AU', 'en'],
        'NZ': ['en-NZ', 'en'],
    };

    return languageMap[countryCode] || ['en-US', 'en'];
}

/**
 * Извлечь IP из строки прокси (host:port или user:pass@host:port)
 */
export function extractIPFromProxy(proxyString: string): string | null {
    try {
        // Удаляем протокол если есть
        let cleaned = proxyString.replace(/^(https?|socks[45]?):\/\//, '');

        // Если есть @, берем часть после @
        if (cleaned.includes('@')) {
            cleaned = cleaned.split('@')[1];
        }

        // Берем host (до первого :)
        const host = cleaned.split(':')[0].trim();

        // Проверяем что это IP или домен
        if (host && host.length > 0) {
            return host;
        }

        return null;
    } catch (error) {
        console.error('[GeoIP] Ошибка извлечения IP:', error);
        return null;
    }
}

/**
 * Получить timezone и язык автоматически по прокси
 */
export async function getTimezoneAndLanguageFromProxy(
    proxyHost: string
): Promise<{ timezone: string; language: string } | null> {
    try {
        const ip = extractIPFromProxy(proxyHost);
        if (!ip) {
            return null;
        }

        const geoInfo = await getGeoIPInfo(ip);
        if (!geoInfo) {
            return null;
        }

        return {
            timezone: geoInfo.timezone,
            language: geoInfo.languages[0] || 'en-US',
        };
    } catch (error) {
        console.error('[GeoIP] Ошибка получения timezone/language:', error);
        return null;
    }
}
