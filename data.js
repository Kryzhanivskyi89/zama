const DAPPS = [
  {
    slug: "2_43_HealthMetricZone",
    title: "2_43 · Health Metric Zone",
    tag: "FHE Scoring",
    chain: "FHEVM · Health",
    description: "Приватний розрахунок «зони здоров'я» за метриками без розкриття сирих даних."
  },
  {
    slug: "2_44_HiddenPerformanceBonus",
    title: "2_44 · Hidden Performance Bonus",
    tag: "Gamified Reward",
    chain: "FHEVM · HR",
    description: "Прихований бонус, що відкривається на основі зашифрованих показників продуктивності."
  },
  {
    slug: "2_45_LeaguePlacementShadow",
    title: "2_45 · League Placement Shadow",
    tag: "Rank · Privacy",
    chain: "FHEVM · Gaming",
    description: "Розрахунок рейтингу й ліги гравця без розкриття точних очок назовні."
  },
  {
    slug: "2_46_ProbabilityTwistWheel",
    title: "2_46 · Probability Twist Wheel",
    tag: "Game · RNG",
    chain: "FHEVM · Gaming",
    description: "Колесо фортуни з обробкою ймовірностей на зашифрованих значеннях."
  },
  {
    slug: "2_47_SecretRiskMap",
    title: "2_47 · Secret Risk Map",
    tag: "Risk Scoring",
    chain: "FHEVM · Scoring",
    description: "Оцінка ризиків на основі зашифрованих параметрів профілю користувача."
  },
  {
    slug: "2_48_HiddenGradeRelease",
    title: "2_48 · Hidden Grade Release",
    tag: "EdTech",
    chain: "FHEVM · Education",
    description: "Розкриття оцінки студенту за умовами, без публічного доступу до балів."
  },
  {
    slug: "2_49_PrivateCashbackTier",
    title: "2_49 · Private Cashback Tier",
    tag: "FinTech",
    chain: "FHEVM · Loyalty",
    description: "Приватне визначення кешбек-рівня клієнта за зашифрованим оборотом."
  },
  {
    slug: "2_50_EncryptedDiceArena",
    title: "2_50 · Encrypted Dice Arena",
    tag: "Game · RNG",
    chain: "FHEVM · Gaming",
    description: "Кидок кубика з повністю зашифрованою логікою й приватним результатом."
  },
  {
    slug: "2_51_SecretMemoryMatch",
    title: "2_51 · Secret Memory Match",
    tag: "Game",
    chain: "FHEVM · Gaming",
    description: "Memory-гра, де стан і збіги обробляються без розкриття карток назовні."
  },
  {
    slug: "2_52_ BlindTargetRange",
    title: "2_52 · Blind Target Range",
    tag: "Threshold",
    chain: "FHEVM · Logic",
    description: "Перевірка, чи потрапляє значення в діапазон, без розкриття ні ліміту, ні значення."
  },
  {
    slug: "2_53_ EncryptedPuzzleSteps",
    title: "2_53 · Encrypted Puzzle Steps",
    tag: "Game",
    chain: "FHEVM · Gaming",
    description: "Пазл, де кроки й прогрес гравця зберігаються в зашифрованому вигляді."
  },
  {
    slug: "2_54_PrivateChessRatingGate",
    title: "2_54 · Private Chess Rating Gate",
    tag: "Rating Gate",
    chain: "FHEVM · Chess",
    description: "Доступ до турніру за рейтингом, де саме значення рейтингу нікому не розкривається."
  },
  {
    slug: "2_55_HiddenDoorCode",
    title: "2_55 · Hidden Door Code",
    tag: "Access Control",
    chain: "FHEVM · Access",
    description: "Перевірка коду доступу без зберігання його у відкритому тексті на блокчейні."
  },
  {
    slug: "2_56_ PrivateCoinFlipperVsHouse",
    title: "2_56 · Private Coin Flipper vs House",
    tag: "Game · PvE",
    chain: "FHEVM · Gaming",
    description: "Орел/решка проти хауса з повністю зашифрованою логікою й результатами гри."
  },
  {
    slug: "2_57_ SecretWeightGuess",
    title: "2_57 · Secret Weight Guess",
    tag: "Guessing",
    chain: "FHEVM · Game",
    description: "Гра «вгадай вагу», де справжнє значення не розкривається навіть після завершення."
  },
  {
    slug: "2_58_ FHEJackpotThreshold",
    title: "2_58 · FHE Jackpot Threshold",
    tag: "Jackpot Logic",
    chain: "FHEVM · Gaming",
    description: "Джекпот, що спрацьовує при досягненні зашифрованого порогу, без розкриття значення."
  },
  {
    slug: "2_59_EncryptedMathDuel",
    title: "2_59 · Encrypted Math Duel",
    tag: "Math Duel",
    chain: "FHEVM · Gaming",
    description: "Математичний дуель з повністю зашифрованими відповідями й результатами."
  },
  {
    slug: "2_60_SecretKaraokeScore",
    title: "2_60 · Secret Karaoke Score",
    tag: "Scorering",
    chain: "FHEVM · Gaming",
    description: "Оголошення результату караоке-гри без розкриття значення."
  },
  {
    slug: "2_61_PrivateRaceTime",
    title: "2_61 · Private Race Time",
    tag: "Race Time",
    chain: "FHEVM · Gaming",
    description: "Оголошення результату гонки без розкриття значення."
  },
  {
    slug: "2_62_HiddenChallengeTier",
    title: "2_62 · Hidden Challenge Tier",
    tag: "Challenge Tier",
    chain: "FHEVM · Gaming",
    description: "Прихований рівень виклику, де рівень не розкривається навіть після завершення."
  },
  {
    slug: "54_SecretHealthMetrics",
    title: "54 · Secret Health Metrics",
    tag: "Health",
    chain: "FHEVM · Health",
    description: "Робота з медичними метриками пацієнта без розкриття даних лікарю чи третім сторонам."
  },
  {
    slug: "78_AgeGatedNFT",
    title: "78 · Age Gated NFT",
    tag: "KYC-less Access",
    chain: "FHEVM · NFT",
    description: "Доступ до NFT на основі віку користувача без розкриття самого значення віку."
  },
  {
    slug: "79_ConfidentialClientFilter",
    title: "79 · Confidential Client Filter",
    tag: "Private Matching",
    chain: "FHEVM · CRM",
    description: "Фільтрація клієнтів за зашифрованими атрибутами без доступу до сирих даних CRM."
  },
  {
    slug: "80_EncryptedCertifications",
    title: "80 · Encrypted Certifications",
    tag: "Certifications",
    chain: "FHEVM · Education",
    description: "Система сертифікацій з повністю зашифрованими результатами та відомостями."
  },
  {
    slug: "81_TinderDAOPrivateMatch",
    title: "81 · TinderDAO Private Match",
    tag: "Private Match",
    chain: "FHEVM · Social",
    description: "DAO-матчінг користувачів за зашифрованими вподобаннями без розкриття профілів."
  },
  {
    slug: "82_PrivateSubscription",
    title: "82 · Private Subscription",
    tag: "Subscription",
    chain: "FHEVM · SaaS",
    description: "Підписка з приватними лімітами/тарифами, що не розкриваються стороннім спостерігачам."
  },
  {
    slug: "83_PrivateOpenSourceRewards",
    title: "83 · Private Open Source Rewards",
    tag: "OSS Rewards",
    chain: "FHEVM · OSS",
    description: "Варіація схеми винагород контриб'юторам з приватними критеріями відбору."
  },
  {
    slug: "84_PrivateTrustChain",
    title: "84 · Private Trust Chain",
    tag: "Reputation",
    chain: "FHEVM · Reputation",
    description: "Ланцюжок довіри й репутації, побудований на зашифрованих рейтингах учасників."
  },
  {
    slug: "85_PrivateDAOReporting",
    title: "85 · Private DAO Reporting",
    tag: "Analytics",
    chain: "FHEVM · DAO",
    description: "Аггрегація метрик DAO із повною приватністю голосів та індивідуальних показників."
  },
  {
    slug: "90_BlindFreelanceMatch",
    title: "90 · Blind Freelance Match",
    tag: "Matching",
    chain: "FHEVM · Freelance",
    description: "Матчінг замовників і фрилансерів за зашифрованими ставками та скілами без їх розкриття."
  },
  {
    slug: "98_PrivateDonorMatch",
    title: "98 · Private Donor Match",
    tag: "Donations",
    chain: "FHEVM · Charity",
    description: "Поєднання донорів і благодійних проєктів за зашифрованими критеріями сум і пріоритетів."
  },
  {
    slug: "123_AnonymousReviewAggregator",
    title: "123 · Anonymous Review Aggregator",
    tag: "Reviews",
    chain: "FHEVM · Social",
    description: "Агрегатор відгуків, де кожен користувач може залишити відгук без розкриття своєї особи."
  }
];
