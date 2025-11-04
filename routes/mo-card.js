/**
 * ============================================================================
 * API Маршруты: Карточка МО
 * GET /api/mo/:mo_id - подробный профиль муниципального образования
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/postgres');

/**
 * GET /api/mo/:mo_id?period=YYYY-MM&version=v1&view=total|public|closed
 * Возвращает полный профиль МО: общие сведения, показатели, штрафы, рекомендации
 */
router.get('/:mo_id', async (req, res) => {
  try {
    const { mo_id } = req.params;
    const { period = '202406', version = 'v1', view = 'total' } = req.query;
    const periodId = parseInt(period);
    const moId = parseInt(mo_id);

    // 1. Получаем общую информацию о МО
    const moInfo = await pool.query(
      `SELECT mo_id, mo_name, oktmo, population, area_km2, mo_type
       FROM dim_municipalities WHERE mo_id = $1`,
      [moId]
    );

    if (moInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'МО не найдено'
      });
    }

    const mo = moInfo.rows[0];

    // 2. Получаем итоговый рейтинг
    const ratingInfo = await pool.query(
      `SELECT score_public, score_closed, score_penalties, score_total, zone,
              completion_rate, indicators_filled_count, indicators_total_count
       FROM fact_summary_ratings
       WHERE mo_id = $1 AND period_id = $2 AND version_id = $3`,
      [moId, periodId, version]
    );

    const rating = ratingInfo.rows[0] || {
      score_public: null,
      score_closed: null,
      score_penalties: 0,
      score_total: null,
      zone: 'unknown',
      completion_rate: 0,
      indicators_filled_count: 0,
      indicators_total_count: 0
    };

    // 3. Получаем показатели (в зависимости от view)
    const indicators = await getIndicators(moId, periodId, version, view);

    // 4. Получаем штрафы
    const penalties = await getPenalties(moId, periodId, version);

    // 5. Получаем историю/динамику за последние 6 месяцев
    const dynamics = await getDynamics(moId, periodId, version);

    // 6. Рассчитываем дорожную карту улучшений
    const recommendations = await getRecommendations(moId, periodId, version, rating);

    // 7. Получаем события из журнала
    const events = await getEvents(moId, periodId);

    // Структурируем ответ
    const response = {
      success: true,
      mo: {
        id: mo.mo_id,
        name: mo.mo_name,
        oktmo: mo.oktmo,
        type: mo.mo_type,
        population: mo.population,
        area: mo.area_km2
      },
      period: {
        id: periodId,
        description: `Периодз ${String(periodId)}`
      },
      rating: {
        public: rating.score_public,
        closed: view === 'total' || view === 'closed' ? rating.score_closed : null,
        penalties: rating.score_penalties,
        total: rating.score_total,
        zone: rating.zone,
        max_total: 66  // 31 (публичный) + 35 (закрытый)
      },
      completion: {
        rate: (rating.completion_rate || 0) * 100,
        filled: rating.indicators_filled_count,
        total: rating.indicators_total_count
      },
      indicators: indicators,
      penalties: penalties,
      dynamics: dynamics,
      recommendations: recommendations,
      events: events,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Ошибка в GET /api/mo/:mo_id:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Получить показатели МО
 */
async function getIndicators(moId, periodId, version, view) {
  const query = `
    SELECT
      i.ind_id,
      i.ind_code,
      i.display_name,
      i.block_name,
      i.is_public,
      i.unit,
      i.owner_org,
      f.value_raw,
      f.score,
      f.comment,
      f.is_verified,
      f.updated_at,
      s.org_name as source_name
    FROM dim_indicators i
    LEFT JOIN fact_indicator_values f ON i.ind_id = f.ind_id
      AND f.mo_id = $1 AND f.period_id = $2 AND f.version_id = $3
    LEFT JOIN src_registry s ON f.source_id = s.source_id
    WHERE (i.is_public = TRUE OR $4 = 'total' OR $4 = 'closed')
      AND i.is_public = (CASE
        WHEN $4 = 'public' THEN TRUE
        WHEN $4 = 'closed' THEN FALSE
        ELSE i.is_public
      END)
    ORDER BY i.block_name, i.ind_id
  `;

  const result = await pool.query(query, [moId, periodId, version, view]);

  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.block_name]) {
      grouped[row.block_name] = [];
    }

    grouped[row.block_name].push({
      id: row.ind_id,
      code: row.ind_code,
      name: row.display_name,
      unit: row.unit,
      owner: row.owner_org,
      value: row.value_raw,
      score: row.score,
      comment: row.comment,
      verified: row.is_verified,
      updated_at: row.updated_at,
      source: row.source_name
    });
  }

  return grouped;
}

/**
 * Получить активные штрафы
 */
async function getPenalties(moId, periodId, version) {
  const query = `
    SELECT
      p.penalty_fact_id,
      d.pen_code,
      d.display_name,
      p.event_date,
      p.penalty_score,
      p.severity_level,
      p.details,
      p.evidence_link,
      p.status,
      p.appeal_date,
      p.appeal_decision
    FROM fact_penalties p
    JOIN dim_penalties d ON p.pen_id = d.pen_id
    WHERE p.mo_id = $1 AND p.period_id = $2 AND p.version_id = $3 AND p.status = 'active'
    ORDER BY p.event_date DESC
  `;

  const result = await pool.query(query, [moId, periodId, version]);

  return result.rows.map(row => ({
    id: row.penalty_fact_id,
    code: row.pen_code,
    name: row.display_name,
    date: row.event_date,
    score: row.penalty_score,
    severity: row.severity_level,
    details: row.details,
    evidence_link: row.evidence_link,
    status: row.status,
    appeal_date: row.appeal_date,
    appeal_decision: row.appeal_decision
  }));
}

/**
 * Получить динамику рейтинга за последние 6 месяцев
 */
async function getDynamics(moId, periodId, version) {
  const query = `
    SELECT
      p.period_id,
      p.description,
      p.date_from,
      r.score_total,
      r.zone
    FROM fact_summary_ratings r
    JOIN dim_period p ON r.period_id = p.period_id
    WHERE r.mo_id = $1 AND r.version_id = $2 AND p.period_type = 'month'
      AND p.period_id <= $3
    ORDER BY p.period_id DESC
    LIMIT 6
  `;

  const result = await pool.query(query, [moId, version, periodId]);

  return result.rows.reverse().map(row => ({
    period: row.period_id,
    description: row.description,
    date: row.date_from,
    score: row.score_total,
    zone: row.zone
  }));
}

/**
 * Рекомендации по улучшению (дорожная карта)
 */
async function getRecommendations(moId, periodId, version, rating) {
  const recommendations = [];

  if (rating.zone === 'red') {
    recommendations.push({
      priority: 'critical',
      title: 'Находитесь в красной зоне',
      description: 'Необходимо срочно улучшить показатели для переводя в жёлтую зону (29+ баллов)',
      actions: [
        'Провести встречу с представителями исполнительной власти',
        'Разработать план действий по ключевым показателям',
        'Начать еженедельный мониторинг прогресса'
      ]
    });
  } else if (rating.zone === 'yellow') {
    recommendations.push({
      priority: 'high',
      title: 'Находитесь в жёлтой зоне',
      description: 'Нужно добрать баллы для выхода в зелёную зону (минимум 53 балла)',
      actions: [
        'Сосредоточиться на показателях с низкими оценками',
        'Усилить партийный консенсус',
        'Увеличить активность в проектной деятельности'
      ]
    });
  }

  // Анализируем слабые показатели
  if (rating.score_public !== null && rating.score_public < 20) {
    recommendations.push({
      priority: 'high',
      title: 'Слабый публичный рейтинг',
      description: `Публичный рейтинг ${rating.score_public}/31 ниже среднего`,
      actions: [
        'Улучшить выполнение задач АГП',
        'Усилить работу с молодёжью и добровольчеством',
        'Развивать проектную деятельность'
      ]
    });
  }

  // Штрафы
  if (rating.score_penalties < -5) {
    recommendations.push({
      priority: 'critical',
      title: 'Высокие штрафы за конфликты',
      description: `Сумма штрафов: ${rating.score_penalties} баллов`,
      actions: [
        'Улучшить взаимодействие с региональной властью',
        'Решить внутримуниципальные конфликты',
        'Провести диалог с представительным органом'
      ]
    });
  }

  return recommendations;
}

/**
 * Получить события из журнала
 */
async function getEvents(moId, periodId) {
  const query = `
    SELECT
      event_id,
      event_type,
      event_title,
      event_description,
      event_date,
      status
    FROM fact_events
    WHERE mo_id = $1 AND period_id = $2 AND is_public = TRUE
    ORDER BY event_date DESC
    LIMIT 10
  `;

  const result = await pool.query(query, [moId, periodId]);

  return result.rows.map(row => ({
    id: row.event_id,
    type: row.event_type,
    title: row.event_title,
    description: row.event_description,
    date: row.event_date,
    status: row.status
  }));
}

module.exports = router;
