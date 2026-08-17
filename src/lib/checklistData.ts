// Media buying checklist - step-by-step guide with services & instructions

export interface ChecklistService {
  id: string;
  name: string;
  /** Domain for favicon: e.g. "keitaro.io" */
  domain?: string;
  brandColor: string;
  brandLetter: string;
  url: string;
  isProxysIntegration?: boolean;
  description: { ru: string; en: string };
  instruction: { ru: string[]; en: string[] };
}

export interface ChecklistCategory {
  id: string;
  name: { ru: string; en: string };
  icon: string;
  services: ChecklistService[];
}

export interface ChecklistStep {
  id: string;
  number: number;
  title: { ru: string; en: string };
  subtitle: { ru: string; en: string };
  icon: string;
  color: string;
  /** In-app guide paragraphs */
  guide?: { ru: string[]; en: string[] };
  /** Step 6: allow uploading creative images */
  hasImageUpload?: boolean;
  /** Step 4: allow uploading cookie files (for purchased accounts) */
  hasCookieUpload?: boolean;
  /** Step 5: show proxy status indicator instead of free input */
  isProxyStep?: boolean;
  categories?: ChecklistCategory[];
  services?: ChecklistService[];
  inputLabel?: { ru: string; en: string };
  inputPlaceholder?: { ru: string; en: string };
}

export interface ChecklistProgressEntry {
  completed: boolean;
  value?: string;
  completedAt?: string;
  /** Creative images stored as base64 data URLs */
  images?: string[];
  /** Cookie file content (JSON text) */
  cookieData?: string;
  /** Cookie filename for display */
  cookieFilename?: string;
}

export interface ChecklistProgress {
  [stepId: string]: ChecklistProgressEntry;
}

export const CHECKLIST_STORAGE_KEY = 'aezakmi_checklist_progress';

export function loadChecklistProgress(): ChecklistProgress {
  try {
    const saved = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveChecklistProgress(progress: ChecklistProgress) {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(progress));
}

// ─── STEPS DATA ─────────────────────────────────────

export const checklistSteps: ChecklistStep[] = [
  // ═══ 1: AFFILIATE ═══
  {
    id: 'affiliate',
    number: 1,
    title: { ru: 'Партнёрская программа', en: 'Affiliate Program' },
    subtitle: { ru: 'Выбери CPA-сеть под свою вертикаль', en: 'Choose a CPA network for your vertical' },
    icon: '🤝',
    color: '#8b5cf6',
    guide: {
      ru: [
        'Партнёрский маркетинг - это модель, где ты получаешь комиссию за привлечение клиентов рекламодателю через свою ссылку.',
        'Выбери вертикаль: гемблинг, нутра, дейтинг или финансы. Каждая имеет свои особенности по ГЕО, ставкам и подходам.',
        'Зарегистрируйся в CPA-сети → выбери оффер → получи партнёрскую ссылку. Именно по ней будут считаться конверсии.',
        'Совет: начни с одной вертикали и одного ГЕО. Не распыляйся - лучше глубоко изучить одну нишу.',
        'Средний доход новичка: $500-2000/мес при бюджете $50-100/день на рекламу.',
      ],
      en: [
        'Affiliate marketing is a model where you earn commissions for bringing customers to an advertiser through your link.',
        'Choose a vertical: gambling, nutra, dating, or finance. Each has unique characteristics by GEO, payouts, and approaches.',
        'Register in a CPA network → choose an offer → get your affiliate link. Conversions are tracked through it.',
        'Tip: start with one vertical and one GEO. Don\'t spread thin - it\'s better to deeply learn one niche.',
        'Average beginner income: $500-2000/mo with a $50-100/day ad budget.',
      ],
    },
    inputLabel: { ru: 'Твоя партнёрская ссылка', en: 'Your affiliate link' },
    inputPlaceholder: { ru: 'https://tracker.example.com/click?pid=...', en: 'https://tracker.example.com/click?pid=...' },
    categories: [
      {
        id: 'gambling',
        name: { ru: 'Гемблинг', en: 'Gambling' },
        icon: '🎰',
        services: [
          {
            id: 'partners1xbet',
            name: '1xBet Partners',
            domain: '1xbet.com',
            brandColor: '#1A5CC8',
            brandLetter: '1x',
            url: 'https://partners1xbet.com/?ref=aezakmi',
            description: { ru: 'Топ-букмекер СНГ. RevShare до 40%, CPA от $30.', en: 'Top CIS bookmaker. RevShare up to 40%, CPA from $30.' },
            instruction: {
              ru: ['Перейдите на partners1xbet.com', 'Нажмите «Регистрация»', 'Заполните форму: email, пароль, источники трафика', 'Подтвердите email', 'В ЛК → «Промо-материалы» → скопируйте ссылку'],
              en: ['Go to partners1xbet.com', 'Click "Registration"', 'Fill form: email, password, traffic sources', 'Confirm email', 'Dashboard → "Promo Materials" → copy link'],
            },
          },
          {
            id: 'pinup_partners',
            name: 'Pin-Up Partners',
            domain: 'pin-up.com',
            brandColor: '#E6192C',
            brandLetter: 'PU',
            url: 'https://pinup.partners/?ref=aezakmi',
            description: { ru: 'Казино + ставки. CPA от $20, RevShare до 50%.', en: 'Casino & betting. CPA from $20, RevShare up to 50%.' },
            instruction: {
              ru: ['Зайдите на pinup.partners', 'Нажмите «Стать партнёром»', 'Укажите источники трафика и Telegram', 'Дождитесь одобрения (1-2 дня)', 'ЛК → «Офферы» → выберите оффер → получите ссылку'],
              en: ['Go to pinup.partners', 'Click "Become a partner"', 'Specify traffic sources & Telegram', 'Wait for approval (1-2 days)', 'Dashboard → "Offers" → select offer → get link'],
            },
          },

        ],
      },
      {
        id: 'nutra',
        name: { ru: 'Нутра / Товарка', en: 'Nutra / E-commerce' },
        icon: '💊',
        services: [
          {
            id: 'dr_cash',
            name: 'Dr.Cash',
            domain: 'dr.cash',
            brandColor: '#00C853',
            brandLetter: 'Dr',
            url: 'https://dr.cash/?ref=aezakmi',
            description: { ru: 'Лидер СНГ по нутре. 3000+ офферов, COD и Trial.', en: 'CIS nutra leader. 3000+ offers, COD and Trial.' },
            instruction: {
              ru: ['Зайдите на dr.cash', 'Нажмите «Регистрация»', 'Укажите email, Telegram, источники трафика', 'Дождитесь модерации (1-24 часа)', 'ЛК → «Офферы» → выберите под ГЕО → скопируйте ссылку'],
              en: ['Go to dr.cash', 'Click "Registration"', 'Specify email, Telegram, traffic sources', 'Wait for moderation (1-24h)', 'Dashboard → "Offers" → pick for GEO → copy link'],
            },
          },

          {
            id: 'leadrock',
            name: 'LeadRock',
            domain: 'leadrock.com',
            brandColor: '#673AB7',
            brandLetter: 'LR',
            url: 'https://leadrock.com/?ref=aezakmi',
            description: { ru: 'Прямой рекл. СНГ нутра + товарка, быстрые выплаты.', en: 'Direct CIS nutra + goods advertiser, fast payouts.' },
            instruction: {
              ru: ['Перейдите на leadrock.com', 'Кликните «Регистрация»', 'Укажите источники трафика', 'Пройдите модерацию', 'Выберите оффер → скопируйте ссылку'],
              en: ['Go to leadrock.com', 'Click "Register"', 'Specify traffic sources', 'Pass moderation', 'Select offer → copy link'],
            },
          },
        ],
      },
      {
        id: 'finance',
        name: { ru: 'Финансы / Крипто', en: 'Finance / Crypto' },
        icon: '💰',
        services: [
          {
            id: 'leadbit',
            name: 'Leadbit',
            domain: 'leadbit.com',
            brandColor: '#2979FF',
            brandLetter: 'LB',
            url: 'https://leadbit.com/?ref=aezakmi',
            description: { ru: 'Мультивертикальная СНГ сеть: финансы, крипто, нутра.', en: 'Multi-vertical CIS network: finance, crypto, nutra.' },
            instruction: {
              ru: ['Зайдите на leadbit.com', 'Кликните «Join Us»', 'Заполните анкету', 'После модерации - выберите финансовые офферы', 'Получите ссылки в «Offers»'],
              en: ['Go to leadbit.com', 'Click "Join Us"', 'Fill application', 'After moderation - select finance offers', 'Get links in "Offers"'],
            },
          },
        ],
      },
    ],
  },

  // ═══ 2: CARDS ═══
  {
    id: 'cards',
    number: 2,
    title: { ru: 'Виртуальные карты', en: 'Virtual Cards' },
    subtitle: { ru: 'Получи карту для оплаты рекламы', en: 'Get a card to pay for ads' },
    icon: '💳',
    color: '#6366f1',
    guide: {
      ru: [
        'Виртуальные карты нужны для оплаты рекламы в Facebook, Google, TikTok. Обычные банковские карты часто блокируются.',
        'Используйте специализированные сервисы виртуальных карт для арбитража — они поддерживают BIN-ы, которые принимают рекламные платформы.',
        'Процесс: регистрация → пополнение (USDT, крипто) → создание карты → привязка к рекламному кабинету.',
        'Важно: один рекламный кабинет = одна карта. Не используй одну карту на несколько аккаунтов.',
        'Совет: пополняй карту с запасом 10-20% от бюджета на случай списаний.',
      ],
      en: [
        'Virtual cards are needed to pay for ads on Facebook, Google, TikTok. Regular bank cards are often blocked.',
        'Use specialized virtual card services for media buying — they support BINs accepted by ad platforms.',
        'Process: registration → top up (USDT, crypto) → create card → link to ad account.',
        'Important: one ad account = one card. Don\'t use one card for multiple accounts.',
        'Tip: top up with 10-20% extra budget for potential charges.',
      ],
    },
    inputLabel: { ru: 'Номер карты или ID', en: 'Card number or ID' },
    inputPlaceholder: { ru: '4242 **** **** 1234', en: '4242 **** **** 1234' },
    services: [],
  },

  // ═══ 3: TRACKER + CLOAKING (Keitaro) ═══
  {
    id: 'tracker',
    number: 3,
    title: { ru: 'Трекер + Клоака', en: 'Tracker + Cloaking' },
    subtitle: { ru: 'Keitaro - трекинг, A/B тесты и клоакинг в одном', en: 'Keitaro - tracking, A/B tests and cloaking in one' },
    icon: '📊',
    color: '#0ea5e9',
    guide: {
      ru: [
        'Трекер - это система, которая отслеживает клики, конверсии, ROI и помогает оптимизировать рекламу.',
        'Клоака - технология, которая показывает модераторам безопасную страницу, а реальным пользователям - оффер. Встроена в Keitaro.',
        'Установка: купите VPS (Ubuntu) → установите Keitaro по инструкции → добавьте домен.',
        'Настройка клоаки: создайте кампанию → добавьте фильтр "Модераторы" → укажите white page и black page.',
        'Используйте A/B тесты для лендингов и креативов - Keitaro автоматически направит трафик на лучший вариант.',
        'Совет: обязательно тестируйте клоаку с VPN из разных стран перед запуском рекламы.',
      ],
      en: [
        'A tracker monitors clicks, conversions, ROI and helps optimize your ads.',
        'Cloaking shows moderators a safe page while real users see the offer. Built into Keitaro.',
        'Setup: buy a VPS (Ubuntu) → install Keitaro → add your domain.',
        'Cloaking setup: create campaign → add "Moderators" filter → set white page and black page.',
        'Use A/B tests for landing pages and creatives - Keitaro auto-routes traffic to the best variant.',
        'Tip: always test cloaking with VPN from different countries before launching ads.',
      ],
    },
    inputLabel: { ru: 'Ссылка трекера', en: 'Tracker link' },
    inputPlaceholder: { ru: 'https://your-keitaro.com/campaign/123', en: 'https://your-keitaro.com/campaign/123' },
    services: [
      {
        id: 'keitaro',
        name: 'Keitaro',
        domain: 'keitaro.io',
        brandColor: '#FF6D00',
        brandLetter: 'K',
        url: 'https://keitaro.io/?ref=aezakmi',
        description: { ru: 'Стандарт индустрии в СНГ. Трекинг + встроенная клоака.', en: 'CIS industry standard. Tracking + built-in cloaking.' },
        instruction: {
          ru: [
            'Зайдите на keitaro.io → выберите тариф',
            'Установите на VPS (Ubuntu) или облако',
            'Добавьте источник трафика (Facebook, Google)',
            'Создайте кампанию → укажите оффер',
            '- Клоака: «Правила» → добавьте фильтры -',
            'Включите фильтр «Модераторы» (IP + UA)',
            'Добавьте white page (безопасная страница)',
            'Укажите black page (реальный оффер)',
            'Протестируйте с VPN из другой страны',
            'Скопируйте ссылку кампании',
          ],
          en: [
            'Go to keitaro.io → choose plan',
            'Install on VPS (Ubuntu) or cloud',
            'Add traffic source (Facebook, Google)',
            'Create campaign → set offer',
            '- Cloaking: "Rules" → add filters -',
            'Enable "Moderators" filter (IP + UA)',
            'Add white page (safe page)',
            'Set black page (real offer)',
            'Test from VPN in another country',
            'Copy campaign link',
          ],
        },
      },
    ],
  },

  // ═══ 4: ACCOUNTS ═══
  {
    id: 'accounts',
    number: 4,
    title: { ru: 'Рекламные аккаунты', en: 'Ad Accounts' },
    subtitle: { ru: 'Купи готовый или прогрей аккаунт вручную', en: 'Buy ready-made or warm up manually' },
    icon: '👤',
    color: '#3b82f6',
    hasCookieUpload: true,
    guide: {
      ru: [
        'Рекламные аккаунты - основа для запуска рекламы. Есть два пути: купить готовый или создать самому (фарм).',
        'Покупка (FB1.SHOP): быстро, но аккаунт нужно "прогреть" - полистать ленту, поставить лайки 1-2 дня.',
        'После покупки скачай куки аккаунта → загрузи их через кнопку ниже → импортируй в профиль AEZAKMI.',
        'Ручной фарм: создай аккаунт через профиль AEZAKMI с прокси → прогревай 5-7 дней (лайки, посты, друзья) → создай рекламный кабинет.',
        'Важно: каждый аккаунт должен работать через свой прокси и свой профиль. Не смешивай!',
        'Совет: привязывай виртуальную карту только после прогрева. Сразу не лей - подожди 1-2 дня.',
      ],
      en: [
        'Ad accounts are the foundation for launching ads. Two paths: buy ready-made or create yourself (farm).',
        'Purchase (FB1.SHOP): fast, but you need to "warm up" - browse feed, like posts for 1-2 days.',
        'After purchase, download account cookies → upload them below → import into AEZAKMI profile.',
        'Manual farm: create account through AEZAKMI profile with proxy → warm up 5-7 days → create ad account.',
        'Important: each account must work through its own proxy and profile. Don\'t mix!',
        'Tip: link the virtual card only after warming up. Don\'t start immediately - wait 1-2 days.',
      ],
    },
    inputLabel: { ru: 'ID аккаунта', en: 'Account ID' },
    inputPlaceholder: { ru: 'act_123456789', en: 'act_123456789' },
    services: [
      {
        id: 'fb1shop',
        name: 'FB1.SHOP',
        domain: 'fb1.shop',
        brandColor: '#1877F2',
        brandLetter: 'FB',
        url: 'https://fb1.shop/',
        description: { ru: 'Магазин аккаунтов Facebook. Фарм-аккаунты, BM, бизнес-менеджеры.', en: 'Facebook account shop. Farm accounts, BM, business managers.' },
        instruction: {
          ru: ['Перейдите на fb1.shop', 'Зарегистрируйтесь и пополните баланс', 'Выберите тип аккаунта (фарм, BM, авторежим)', 'Скачайте куки / данные аккаунта', 'Импортируйте куки в профиль AEZAKMI', 'Запустите профиль → залогиньтесь', 'Привяжите виртуальную карту'],
          en: ['Go to fb1.shop', 'Register and top up', 'Select account type (farm, BM, auto-reg)', 'Download cookies / account data', 'Import cookies into AEZAKMI profile', 'Launch profile → log in', 'Link a virtual card'],
        },
      },
      {
        id: 'fb_manual',
        name: 'Ручной фарм',
        brandColor: '#43A047',
        brandLetter: '🌱',
        url: '',
        description: { ru: 'Самостоятельный прогрев аккаунта в AEZAKMI.', en: 'Manual account warming in AEZAKMI.' },
        instruction: {
          ru: ['Создайте профиль в AEZAKMI', 'Назначьте прокси нужного ГЕО (Proxys.io)', 'Зарегистрируйте аккаунт FB через профиль', 'Прогревайте 3-7 дней: лайки, посты, друзья', 'Создайте бизнес-менеджер и рекламный кабинет', 'Привяжите виртуальную карту'],
          en: ['Create profile in AEZAKMI', 'Assign a proxy in the right GEO (Proxys.io)', 'Register FB account through profile', 'Warm up 3-7 days: likes, posts, friends', 'Create Business Manager and ad account', 'Link a virtual card'],
        },
      },
    ],
  },

  // ═══ 5: PROXIES ═══
  {
    id: 'proxies',
    number: 5,
    title: { ru: 'Прокси', en: 'Proxies' },
    subtitle: { ru: 'Подключи прокси для безопасной работы', en: 'Connect proxies for safe operation' },
    icon: '🛡️',
    color: '#f97316',
    isProxyStep: true,
    guide: {
      ru: [
        'Прокси маскируют твой IP и создают видимость работы из другой страны. Без прокси аккаунты будут быстро заблокированы.',
        'Типы: резидентные (IP реальных людей) - лучше всего для FB. Мобильные - для агрессивного залива.',
        'Proxys.io встроен прямо в AEZAKMI! Вставь API-ключ → выбери тип и страну → купи прокси → они добавятся автоматически.',
        'Один профиль = один прокси. Не используй один прокси на несколько аккаунтов.',
        'Совет: выбирай ГЕО прокси = ГЕО оффера. Если льёшь на Бразилию - прокси из Бразилии.',
      ],
      en: [
        'Proxies mask your IP and simulate browsing from another country. Without proxies, accounts get banned quickly.',
        'Types: residential (real people\'s IPs) - best for FB. Mobile - for aggressive campaigns.',
        'Proxys.io is built into AEZAKMI! Insert API key → pick type & country → buy → proxies auto-add.',
        'One profile = one proxy. Don\'t use one proxy for multiple accounts.',
        'Tip: proxy GEO should match offer GEO. If targeting Brazil - use Brazilian proxies.',
      ],
    },
    inputLabel: { ru: 'API-ключ Proxys.io', en: 'Proxys.io API Key' },
    inputPlaceholder: { ru: 'Вставьте ваш API-ключ', en: 'Paste your API key' },
    services: [
      {
        id: 'proxys',
        name: 'Proxys.io',
        domain: 'proxys.io',
        brandColor: '#75C948',
        brandLetter: 'PX',
        url: 'https://proxys.world/?refid=426237',
        isProxysIntegration: true,
        description: { ru: 'IPv4/IPv6 прокси, 80+ стран. Встроены в AEZAKMI!', en: 'IPv4/IPv6 proxies, 80+ countries. Built into AEZAKMI!' },
        instruction: {
          ru: ['Нажмите «Открыть Proxys.io» ниже', 'Зарегистрируйтесь и пополните баланс', 'Скопируйте API-ключ в разделе «Настройки → API»', 'Вставьте ключ в AEZAKMI', 'Выберите тип прокси, страну и срок', 'Купите → прокси добавятся автоматически'],
          en: ['Click "Open Proxys.io" below', 'Sign up and top up your balance', 'Copy the API key from "Settings → API"', 'Paste the key into AEZAKMI', 'Pick proxy type, country and period', 'Purchase → auto-added to list'],
        },
      },
    ],
  },

  // ═══ 6: SPY + CREATIVES ═══
  {
    id: 'spy',
    number: 6,
    title: { ru: 'Spy-сервис и креативы', en: 'Spy Service & Creatives' },
    subtitle: { ru: 'Анализируй конкурентов и создай креативы', en: 'Analyze competitors and create creatives' },
    icon: '🕵️',
    color: '#ef4444',
    hasImageUpload: true,
    guide: {
      ru: [
        'Spy-сервисы показывают рекламу конкурентов: какие креативы работают, на какие ГЕО льют, какие лендинги используют.',
        'AdPlexity - мировой лидер. Фильтруй по нише, ГЕО, платформе. Скачивай лендинги одним кликом.',
        'Canva - бесплатный конструктор. Используй шаблоны 1080×1080 (FB лента) и 1200×628 (FB правая колонка).',
        'Загрузи готовые креативы через кнопку ниже - они сохранятся в "Мои инструменты" для быстрого доступа.',
        'Формула: найди работающий креатив у конкурента → адаптируй (не копируй!) → тестируй 3-5 вариантов.',
        'Совет: видео-креативы дают CTR в 2-3 раза выше, чем статичные баннеры.',
      ],
      en: [
        'Spy services show competitor ads: what creatives work, which GEOs they target, which landing pages they use.',
        'AdPlexity - world leader. Filter by niche, GEO, platform. Download landing pages in one click.',
        'Canva - free designer. Use 1080×1080 (FB feed) and 1200×628 (FB right column) templates.',
        'Upload ready creatives below - they\'ll be saved in "My Tools" for quick access.',
        'Formula: find working competitor creative → adapt (don\'t copy!) → test 3-5 variants.',
        'Tip: video creatives get 2-3x higher CTR than static banners.',
      ],
    },
    services: [
      {
        id: 'adplexity',
        name: 'AdPlexity',
        domain: 'adplexity.com',
        brandColor: '#FF5722',
        brandLetter: 'AP',
        url: 'https://adplexity.com/',
        description: { ru: 'Мировой spy-сервис. Push, Native, Mobile, Desktop, E-commerce.', en: 'World-class spy tool. Push, Native, Mobile, Desktop, E-commerce.' },
        instruction: {
          ru: ['Перейдите на adplexity.com', 'Выберите тариф (Push / Native / Mobile / Desktop)', 'Зарегистрируйтесь и оплатите', 'Используйте фильтры: ниша, ГЕО, платформа, даты', 'Найдите топовые объявления конкурентов', 'Скачайте лендинги → изучите связки', 'Адаптируйте креативы под свой оффер'],
          en: ['Go to adplexity.com', 'Choose plan (Push / Native / Mobile / Desktop)', 'Register and pay', 'Use filters: niche, GEO, platform, dates', 'Find top competitor ads', 'Download landing pages → study funnels', 'Adapt creatives for your offer'],
        },
      },
      {
        id: 'canva',
        name: 'Canva',
        domain: 'canva.com',
        brandColor: '#00C4CC',
        brandLetter: 'C',
        url: 'https://canva.com',
        description: { ru: 'Бесплатный конструктор креативов и баннеров.', en: 'Free creative & banner designer.' },
        instruction: {
          ru: ['Зайдите на canva.com', 'Зарегистрируйтесь (бесплатно)', 'Выберите шаблон: 1080×1080, 1200×628', 'Адаптируйте под оффер', 'Скачайте в PNG/MP4'],
          en: ['Go to canva.com', 'Register (free)', 'Choose template: 1080×1080, 1200×628', 'Adapt for offer', 'Download as PNG/MP4'],
        },
      },
    ],
  },

  // ═══ 7: LAUNCH ═══
  {
    id: 'launch',
    number: 7,
    title: { ru: 'Запуск рекламы', en: 'Launch Ads' },
    subtitle: { ru: 'Запускай кампании и масштабируй', en: 'Launch campaigns and scale' },
    icon: '🚀',
    color: '#eab308',
    guide: {
      ru: [
        'Финальный этап! У тебя есть: оффер, карта, трекер с клоакой, аккаунт, прокси и креативы. Всё готово.',
        'Запуск FB: профиль AEZAKMI → Facebook Ads Manager → Создать кампанию → Конверсии → аудитория → креативы → ссылка трекера.',
        'Бюджет старт: $20-50/день на одну адсет. Не лей сразу много - дай алгоритму обучиться.',
        'Первые 24-48 часов - только наблюдай. Не трогай кампанию! После - анализируй CTR, CR, ROI.',
        'Оптимизация: отключай адсеты с ROI < -30%. Масштабируй прибыльные (+20% бюджета каждые 2 дня).',
        'Совет: дублируй прибыльные кампании на новые аккаунты для масштабирования.',
      ],
      en: [
        'Final step! You have: offer, card, tracker with cloaking, account, proxies, and creatives. All set.',
        'FB launch: AEZAKMI profile → Facebook Ads Manager → Create campaign → Conversions → audience → creatives → tracker link.',
        'Starting budget: $20-50/day per ad set. Don\'t spend heavily at once - let the algorithm learn.',
        'First 24-48 hours - just observe. Don\'t touch the campaign! After - analyze CTR, CR, ROI.',
        'Optimization: disable ad sets with ROI < -30%. Scale profitable ones (+20% budget every 2 days).',
        'Tip: duplicate profitable campaigns to new accounts for scaling.',
      ],
    },
    inputLabel: { ru: 'Ссылка на кампанию', en: 'Campaign link' },
    inputPlaceholder: { ru: 'https://business.facebook.com/ads/...', en: 'https://business.facebook.com/ads/...' },
    services: [
      {
        id: 'fb_launch',
        name: 'Facebook Ads',
        domain: 'facebook.com',
        brandColor: '#1877F2',
        brandLetter: 'FB',
        url: 'https://business.facebook.com',
        description: { ru: 'Запуск РК в Facebook / Meta Ads Manager.', en: 'Launch in Facebook / Meta Ads Manager.' },
        instruction: {
          ru: ['Запустите профиль AEZAKMI с аккаунтом и прокси', 'Откройте Facebook Ads Manager', '«Создать» → Конверсии', 'Настройте аудиторию: ГЕО, возраст, интересы', 'Загрузите креативы', 'Укажите ссылку трекера', 'Бюджет: $20-50/день → запуск!'],
          en: ['Launch AEZAKMI profile with account & proxy', 'Open Facebook Ads Manager', '"Create" → Conversions', 'Set audience: GEO, age, interests', 'Upload creatives', 'Use tracker link', 'Budget: $20-50/day → launch!'],
        },
      },
      {
        id: 'google_launch',
        name: 'Google Ads',
        domain: 'google.com',
        brandColor: '#4285F4',
        brandLetter: 'G',
        url: 'https://ads.google.com',
        description: { ru: 'Запуск РК в Google Ads: поиск, дисплей, PMax.', en: 'Launch in Google Ads: search, display, PMax.' },
        instruction: {
          ru: ['Запустите профиль с Google аккаунтом', 'Зайдите в Google Ads', 'Создайте кампанию → Поиск / Дисплей / PMax', 'Настройте таргетинг', 'Добавьте объявления', 'Установите ставки и бюджет', 'Запустите!'],
          en: ['Launch profile with Google account', 'Go to Google Ads', 'Create campaign → Search / Display / PMax', 'Set targeting', 'Add ads', 'Set bids & budget', 'Launch!'],
        },
      },
      {
        id: 'tiktok_launch',
        name: 'TikTok Ads',
        domain: 'tiktok.com',
        brandColor: '#000000',
        brandLetter: 'TT',
        url: 'https://ads.tiktok.com',
        description: { ru: 'TikTok Ads Manager - молодая аудитория СНГ.', en: 'TikTok Ads Manager - young CIS audience.' },
        instruction: {
          ru: ['Запустите профиль с аккаунтом TikTok', 'Откройте TikTok Ads Manager', 'Создайте кампанию → Конверсии', 'Загрузите видео-креативы', 'Настройте аудиторию', 'Установите бюджет → запуск!'],
          en: ['Launch profile with TikTok account', 'Open TikTok Ads Manager', 'Create campaign → Conversions', 'Upload video creatives', 'Set audience', 'Set budget → launch!'],
        },
      },
    ],
  },
];
