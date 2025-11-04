-- ============================================================================
-- МВП-аналитика: Генерация тестовых данных
-- Создаём 3 профиля МО (зелёный, жёлтый, красный) с историей 6+ месяцев
-- ============================================================================

-- Отключаем ограничения для быстрой вставки
SET CONSTRAINTS ALL DEFERRED;

-- ============================================================================
-- РАЗДЕЛ 1: Генерируем тестовые данные для "зелёного" МО (Липецк)
-- МО 1: Город Липецк — эффективный, хороший рейтинг (60+ баллов)
-- ============================================================================

-- PUB_001_SUPPORT (0-3): Сильная поддержка = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 1, 'v1', 3, 3, 1, 'Постоянная поддержка губернатора'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_002_AGP_TASKS (0-5): Высокое выполнение (95%) = 5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 2, 'v1', 95, 5, 1, 'Выполнено 95% всех задач АГП'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_003_POSITION (0-3): Хозяйственник = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 3, 'v1', 3, 3, 1, 'Четкий образ хозяйственника'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_004_PROJECTS (0-3): 2 региональных проекта + 3 муниципальных = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 4, 'v1', 2, 3, 1, 'Активная проектная деятельность'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_005_VOLUNTEERS (0-3): 35% молодёжи в добровольчестве = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 5, 'v1', 35, 3, 3, '35% молодых волонтёров'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_006_DP_ACTIVE (0-3): 28% в Движении Первых = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 6, 'v1', 28, 2, 2, '28% детей в ДП'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_007_VETERANS (0-3): Активно встречается = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 7, 'v1', 3, 3, 6, 'Еженедельные встречи с ветеранами'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_008_RESERVE (0-3): 75% должностей в резерве = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 8, 'v1', 75, 2, 6, 'Хороший кадровый резерв (75%)'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_009_GRANTS (0-3): 5 побед за год = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 9, 'v1', 5, 3, 4, 'Успешная грантовая деятельность (5 побед)'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_001_PARTY (0-6): 70% членов/сторонников = 5.5 (немного 5)
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 10, 'v1', 5.5, 5.5, 5, 'Очень высокий партийный консенсус'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_002_ALT_OPINION (0/2/4): 100% мест партии = 4
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 11, 'v1', 100, 4, 1, 'Полный контроль представительного органа'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_003_AGP_LEVEL (0/3/5): Превышен на 8% = 5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 12, 'v1', 5, 5, 1, 'АГП уровень превышен'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_004_AGP_QUALITY (0/3/5): Превышен = 5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 13, 'v1', 5, 5, 1, 'АГП качество превышено'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_005_ECO_ATTRACT (1/2/3): высокая привлекательность = 1
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 14, 'v1', 1, 1, 1, 'Высокая экономическая привлекательность'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_006_VETERANS_ACT (0-6): Активность ветеранов = 5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 15, 'v1', 5, 5, 5, 'Высокая активность ветеранов СВО'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_007_PRIDE (0/2): есть представители = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 1, period_id, 16, 'v1', 2, 2, 5, 'Есть представители в "Гордости"'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- Итоги для Липецка:
-- Публичный: 3 + 5 + 3 + 3 + 3 + 2 + 3 + 2 + 3 = 27/31
-- Закрытый: 5.5 + 4 + 5 + 5 + 1 + 5 + 2 = 27.5/35
-- Штрафы: 0 (чистая репутация)
-- ИТОГО: 27 + 27.5 = 54.5 ✅ ЗЕЛЁНАЯ ЗОНА (53-66)


-- ============================================================================
-- РАЗДЕЛ 2: Тестовые данные для "жёлтого" МО (Елец)
-- МО 4: Город Елец — среднее состояние (40-50 баллов)
-- ============================================================================

-- PUB_001_SUPPORT: частичная поддержка = 1.5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 1, 'v1', 50, 1.5, 1, 'Периодическая поддержка'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_002_AGP_TASKS: средний уровень 70% = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 2, 'v1', 70, 2, 1, 'Выполнено 70% задач'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_003_POSITION: размытый образ = 0
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 3, 'v1', 0, 0, 1, 'Размытый образ главы'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_004_PROJECTS: только 1 региональный = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 4, 'v1', 1, 2, 1, 'Один региональный проект'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_005_VOLUNTEERS: 20% = 1
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 5, 'v1', 20, 1, 3, '20% молодёжи'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_006_DP_ACTIVE: 15% = 0
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 6, 'v1', 15, 0, 2, '15% детей'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_007_VETERANS: низкая активность = 1
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 7, 'v1', 1, 1, 6, 'Редкие встречи'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_008_RESERVE: 40% = 1
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 8, 'v1', 40, 1, 6, 'Минимальный резерв'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- PUB_009_GRANTS: 1 победа = 1
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 9, 'v1', 1, 1, 4, 'Одна гранта'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_001_PARTY: 35% = 2.5
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 10, 'v1', 3.5, 3.5, 5, 'Средний партийный консенсус'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_002_ALT_OPINION: 94% мест = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 11, 'v1', 94, 2, 1, 'Оппозиция есть (6%)'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_003_AGP_LEVEL: выполнен = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 12, 'v1', 3, 3, 1, 'АГП уровень выполнен'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_004_AGP_QUALITY: выполнен = 3
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 13, 'v1', 3, 3, 1, 'АГП качество выполнено'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_005_ECO_ATTRACT: средняя = 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 14, 'v1', 2, 2, 1, 'Средняя экономическая привлекательность'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_006_VETERANS_ACT: 2
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 15, 'v1', 2, 2, 5, 'Слабая активность ветеранов'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- CLOSED_007_PRIDE: нет = 0
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 4, period_id, 16, 'v1', 0, 0, 5, 'Нет представителей'
FROM dim_period WHERE period_type = 'month' AND date_from >= '2024-01-01'
ON CONFLICT DO NOTHING;

-- Штрафное событие: внутримуниципальный конфликт (-2)
INSERT INTO fact_penalties (mo_id, period_id, pen_id, version_id, event_date, penalty_score, severity_level, details, source_id)
SELECT 4, 202406, 2, 'v1', '2024-06-15', -2, 'moderate',
 'Публичный спор между главой и председателем представительного органа',
 7
WHERE NOT EXISTS (SELECT 1 FROM fact_penalties WHERE mo_id=4 AND period_id=202406 AND pen_id=2);

-- Итоги для Елца:
-- Публичный: 1.5 + 2 + 0 + 2 + 1 + 0 + 1 + 1 + 1 = 9.5/31
-- Закрытый: 3.5 + 2 + 3 + 3 + 2 + 2 + 0 = 15.5/35
-- Штрафы: -2
-- ИТОГО: 9.5 + 15.5 - 2 = 23 ❌ КРАСНАЯ ЗОНА (0-28)

-- Но это слишком низко, давайте подправим для жёлтой зоны
UPDATE fact_indicator_values SET score = 2.5 WHERE mo_id = 4 AND ind_id = 1;  -- +1
UPDATE fact_indicator_values SET score = 2.5 WHERE mo_id = 4 AND ind_id = 5;  -- +1.5
UPDATE fact_indicator_values SET score = 1 WHERE mo_id = 4 AND ind_id = 6;    -- +1
UPDATE fact_indicator_values SET score = 2 WHERE mo_id = 4 AND ind_id = 7;    -- +1
UPDATE fact_indicator_values SET score = 2 WHERE mo_id = 4 AND ind_id = 8;    -- +1
-- Итоги скорректированные: 2.5 + 2 + 0 + 2 + 2.5 + 1 + 2 + 2 + 1 = 15/31
-- Закрытый: 3.5 + 2 + 3 + 3 + 2 + 2 + 0 = 15.5/35
-- ИТОГО: 15 + 15.5 - 2 = 28.5 ✅ ЖЁЛТАЯ ЗОНА (29-52)... всё ещё низко

-- Добавим ещё штрафов не будет, просто поднимем немного:
UPDATE fact_indicator_values SET score = 3 WHERE mo_id = 4 AND ind_id = 2;  -- +1 (68%)
UPDATE fact_indicator_values SET score = 1 WHERE mo_id = 4 AND ind_id = 3;  -- +1
-- Новые итоги: 2.5 + 3 + 1 + 2 + 2.5 + 1 + 2 + 2 + 1 = 17/31
-- ИТОГО: 17 + 15.5 - 2 = 30.5 ✅ ЖЁЛТАЯ ЗОНА


-- ============================================================================
-- РАЗДЕЛ 3: Тестовые данные для "красного" МО (Добровский район)
-- МО 8: Добровский муниципальный район — низкое состояние (<28 баллов)
-- ============================================================================

-- Минимальные баллы по всем показателям
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
VALUES
(8, 202401, 1, 'v1', 0, 0, 1, 'Нет поддержки'),
(8, 202401, 2, 'v1', 45, 0, 1, 'Выполнено только 45%'),
(8, 202401, 3, 'v1', 0, 0, 1, 'Размытый образ'),
(8, 202401, 4, 'v1', 0, 0, 1, 'Нет проектов'),
(8, 202401, 5, 'v1', 10, 0, 3, '10% волонтёров'),
(8, 202401, 6, 'v1', 8, 0, 2, '8% в ДП'),
(8, 202401, 7, 'v1', 0, 0, 6, 'Нет встреч с ветеранами'),
(8, 202401, 8, 'v1', 20, 0, 6, '20% кадрового резерва'),
(8, 202401, 9, 'v1', 0, 0, 4, 'Нет грантов'),
(8, 202401, 10, 'v1', 1, 1, 5, 'Низкий партийный консенсус'),
(8, 202401, 11, 'v1', 80, 0, 1, 'Значительная оппозиция'),
(8, 202401, 12, 'v1', 0, 0, 1, 'АГП не выполнен'),
(8, 202401, 13, 'v1', 0, 0, 1, 'АГП качество не достигнут'),
(8, 202401, 14, 'v1', 3, 3, 1, 'Низкая экономическая привлекательность (балл 3)'),
(8, 202401, 15, 'v1', 0, 0, 5, 'Ветераны неактивны'),
(8, 202401, 16, 'v1', 0, 0, 5, 'Нет представителей');

-- Копируем данные на все периоды для красного МО
INSERT INTO fact_indicator_values (mo_id, period_id, ind_id, version_id, value_raw, score, source_id, comment)
SELECT 8, p.period_id, f.ind_id, f.version_id, f.value_raw, f.score, f.source_id, f.comment
FROM fact_indicator_values f
CROSS JOIN dim_period p
WHERE f.mo_id = 8 AND f.period_id = 202401 AND p.period_type = 'month' AND p.period_id > 202401
ON CONFLICT DO NOTHING;

-- Штрафные события для красного МО
INSERT INTO fact_penalties (mo_id, period_id, pen_id, version_id, event_date, penalty_score, severity_level, details, source_id)
VALUES
(8, 202401, 1, 'v1', '2024-01-20', -3, 'serious', 'Открытое противостояние с губернатором', 1),
(8, 202402, 2, 'v1', '2024-02-14', -3, 'serious', 'Частые конфликты в представительном органе', 7),
(8, 202404, 3, 'v1', '2024-04-10', -2, 'moderate', 'Административное разбирательство', 7);

-- Итоги для Добровского района:
-- Публичный: 0+0+0+0+0+0+0+0+0 = 0/31
-- Закрытый: 1+0+0+0+3+0+0 = 4/35
-- Штрафы: -3-3-2 = -8
-- ИТОГО: 0 + 4 - 8 = -4 (кэпируем на 0) ✅ КРАСНАЯ ЗОНА


-- ============================================================================
-- РАЗДЕЛ 4: Генерируем сводные рейтинги (fact_summary_ratings)
-- ============================================================================

-- Функция или процедура для расчёта сводных оценок
-- Для простоты заполняем вручную на основе вычисленных выше баллов

-- Липецк (зелёный МО) — все месяцы 2024 и 2025
INSERT INTO fact_summary_ratings (mo_id, period_id, version_id, score_public, score_closed, score_penalties, score_total, zone, indicators_total_count, indicators_filled_count, completion_rate)
SELECT 1, period_id, 'v1', 27, 27.5, 0, 54.5, 'green', 17, 17, 100.0
FROM dim_period WHERE period_type = 'month'
ON CONFLICT DO NOTHING;

-- Елец (жёлтый МО)
INSERT INTO fact_summary_ratings (mo_id, period_id, version_id, score_public, score_closed, score_penalties, score_total, zone, indicators_total_count, indicators_filled_count, completion_rate)
SELECT 4, period_id, 'v1', 17, 15.5, -2, 30.5, 'yellow', 17, 17, 100.0
FROM dim_period WHERE period_type = 'month'
ON CONFLICT DO NOTHING;

-- Добровский (красный МО)
INSERT INTO fact_summary_ratings (mo_id, period_id, version_id, score_public, score_closed, score_penalties, score_total, zone, indicators_total_count, indicators_filled_count, completion_rate)
SELECT 8, period_id, 'v1', 0, 4, -8, 0, 'red', 17, 17, 100.0
FROM dim_period WHERE period_type = 'month'
ON CONFLICT DO NOTHING;

-- Остальные МО — сброс на средние значения (жёлтая зона 30-40)
INSERT INTO fact_summary_ratings (mo_id, period_id, version_id, score_public, score_closed, score_penalties, score_total, zone, indicators_total_count, indicators_filled_count, completion_rate)
SELECT m.mo_id, p.period_id, 'v1', 12, 18, -1, 29, 'yellow', 17, 17, 100.0
FROM dim_municipalities m
CROSS JOIN dim_period p
WHERE m.mo_id NOT IN (1, 4, 8) AND p.period_type = 'month'
  AND NOT EXISTS (SELECT 1 FROM fact_summary_ratings WHERE mo_id = m.mo_id AND period_id = p.period_id)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- РАЗДЕЛ 5: Пример события в журнале
-- ============================================================================

INSERT INTO fact_events (mo_id, period_id, event_type, event_title, event_description, event_date, source_id, status)
VALUES
(1, 202406, 'award', 'Признание эффективности', 'Липецк получил признание как лучший МО по выполнению целей', '2024-06-30', 1, 'confirmed'),
(4, 202406, 'conflict', 'Конфликт с органом представительной власти', 'Глава Ельца вступил в публичный спор с председателем совета', '2024-06-15', 7, 'confirmed'),
(8, 202402, 'incident', 'Административное разбирательство', 'Возбуждено административное дело против главы района', '2024-02-14', 7, 'confirmed');

-- ============================================================================
-- РАЗДЕЛ 6: Статистика и проверки
-- ============================================================================

SELECT '=== СТАТИСТИКА ДАННЫХ ===' AS section;
SELECT COUNT(*) as total_indicator_values FROM fact_indicator_values;
SELECT COUNT(*) as total_penalties FROM fact_penalties;
SELECT COUNT(*) as total_ratings FROM fact_summary_ratings;
SELECT COUNT(*) as total_events FROM fact_events;

SELECT '=== РЕЙТИНГИ ПО ЗОНАМ ===' AS section;
SELECT zone, COUNT(*) as count, AVG(score_total)::NUMERIC(5,1) as avg_score
FROM fact_summary_ratings WHERE version_id = 'v1'
GROUP BY zone ORDER BY zone;

SELECT '=== РЕЙТИНГ ТОП-5 ===' AS section;
SELECT r.period_id, m.mo_name, r.score_total, r.zone
FROM fact_summary_ratings r
JOIN dim_municipalities m ON r.mo_id = m.mo_id
WHERE r.version_id = 'v1' AND r.period_id = 202406
ORDER BY r.score_total DESC LIMIT 5;

-- ============================================================================
-- ЗАВЕРШЕНИЕ
-- ============================================================================

COMMIT;
