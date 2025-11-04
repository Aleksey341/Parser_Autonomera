/**
 * ============================================================================
 * Модуль расчётного движка (Scoring Engine)
 * Вычисляет баллы по методике для каждого показателя и итоговый рейтинг
 * ============================================================================
 */

const pool = require('../db/postgres');

/**
 * Основной класс расчётного движка
 */
class ScoringEngine {
  /**
   * Расчёт балла показателя по его значению и шкале
   * @param {number} indId - ID показателя
   * @param {number} value - Исходное значение (из источника)
   * @param {string} versionId - Версия методики
   * @returns {Promise<number>} Рассчитанный балл
   */
  static async calcIndicatorScore(indId, value, versionId = 'v1') {
    try {
      // Получаем информацию о показателе
      const indResult = await pool.query(
        'SELECT ind_code, calc_rule_id FROM dim_indicators WHERE ind_id = $1',
        [indId]
      );
      if (indResult.rows.length === 0) throw new Error(`Indicator ${indId} not found`);

      const indCode = indResult.rows[0].ind_code;
      const calcRule = indResult.rows[0].calc_rule_id;

      // Получаем шкалу для этого показателя
      const scaleResult = await pool.query(
        `SELECT score, threshold_min, threshold_max
         FROM map_scale
         WHERE version_id = $1 AND ind_id = $2
         ORDER BY threshold_min`,
        [versionId, indId]
      );

      if (scaleResult.rows.length === 0) {
        // Нет явной шкалы — используем категориальную логику
        return this.calcCategoricalScore(indCode, value);
      }

      // Ищем порог, в который попадает значение
      for (const row of scaleResult.rows) {
        if (value >= row.threshold_min && value <= row.threshold_max) {
          return row.score;
        }
      }

      // Если не попали ни в один порог, возвращаем 0
      return 0;
    } catch (error) {
      console.error('❌ Ошибка в calcIndicatorScore:', error.message);
      throw error;
    }
  }

  /**
   * Категориальные логики для сложных показателей
   */
  static calcCategoricalScore(indCode, value) {
    const rules = {
      // Позиционирование главы
      'PUB_003_POSITION': () => {
        // "хозяйственник/функционер" => 3, иначе 0
        return (value === 'function' || value === 'entrepreneur') ? 3 : 0;
      },

      // Проектная деятельность
      'PUB_004_PROJECTS': () => {
        // value = {regional: N, municipal: N}
        const regional = value.regional || 0;
        const municipal = value.municipal || 0;
        if (regional >= 1 && municipal >= 1) return 3;
        if (regional >= 1) return 2;
        if (municipal >= 1) return 1;
        return 0;
      },

      // Личная вовлечённость главы
      'PUB_007_VETERANS': () => {
        // value = {frequency: 'weekly'|'monthly'|'quarterly'|'never', solved_share: 0-100}
        const freqScore = {
          'weekly': 3,
          'monthly': 2,
          'quarterly': 1,
          'never': 0
        }[value.frequency] || 0;

        const solvedShare = value.solved_share || 0;
        const solvedBonus = solvedShare > 50 ? 1 : 0;

        return Math.min(freqScore + solvedBonus, 3);
      },

      // Гранты
      'PUB_009_GRANTS': () => {
        // value = {wins: N, total_amount: N, violations: N}
        const wins = value.wins || 0;
        const amount = value.total_amount || 0;
        const violations = value.violations || 0;

        if (violations > 0) return 0; // За нарушения — 0
        if (wins >= 3 || amount >= 10_000_000) return 3;
        if (wins >= 1 || amount >= 1_000_000) return 1;
        return 0;
      },

      // Партийное мнение
      'CLOSED_001_PARTY': () => {
        // value = {members: 0-3, supporters: 0-3}
        const members = Math.min(value.members || 0, 3);
        const supporters = Math.min(value.supporters || 0, 3);
        return members + supporters; // 0-6
      },

      // Альтернативное мнение
      'CLOSED_002_ALT_OPINION': () => {
        // value = share_percent (0-100)
        if (value >= 100) return 4;
        if (value >= 94) return 2;
        return 0;
      },

      // АГП уровень и качество
      'CLOSED_003_AGP_LEVEL': () => this.scoreAgpStatus(value),
      'CLOSED_004_AGP_QUALITY': () => this.scoreAgpStatus(value),

      // Эконом. привлекательность
      'CLOSED_005_ECO_ATTRACT': () => {
        // value: 'high' (1), 'medium' (2), 'low' (3)
        const catScores = { 'high': 1, 'medium': 2, 'low': 3 };
        return catScores[value] || 0;
      },

      // Ветераны
      'CLOSED_006_VETERANS_ACT': () => {
        // value = {members: 0-3, supporters: 0-3}
        const members = Math.min(value.members || 0, 3);
        const supporters = Math.min(value.supporters || 0, 3);
        return members + supporters; // 0-6
      },

      // Гордость Липецкой земли
      'CLOSED_007_PRIDE': () => {
        return value && value.representatives_count > 0 ? 2 : 0;
      }
    };

    const fn = rules[indCode];
    if (!fn) {
      console.warn(`⚠️ Неизвестный индикатор: ${indCode}`);
      return 0;
    }

    try {
      return fn();
    } catch (error) {
      console.error(`❌ Ошибка расчёта ${indCode}:`, error.message);
      return 0;
    }
  }

  /**
   * Вспомогательная функция для АГП статусов
   */
  static scoreAgpStatus(value) {
    // value = 'not_met' | 'met' | 'exceeded_lte10'
    const scores = {
      'not_met': 0,
      'met': 3,
      'exceeded_lte10': 5
    };
    return scores[value] || 0;
  }

  /**
   * Расчёт публичного рейтинга (макс 31)
   * @param {number} moId - ID муниципалитета
   * @param {number} periodId - ID периода
   * @param {string} versionId - Версия методики
   * @returns {Promise<object>} {score: N, details: {...}}
   */
  static async calcPublicRating(moId, periodId, versionId = 'v1') {
    try {
      // Получаем все публичные показатели (9 штук)
      const indicators = await pool.query(
        `SELECT ind_id, ind_code, display_name
         FROM dim_indicators
         WHERE is_public = TRUE
         ORDER BY ind_id`
      );

      let totalScore = 0;
      const details = {};

      for (const ind of indicators.rows) {
        // Получаем значение показателя из fact_indicator_values
        const valResult = await pool.query(
          `SELECT score FROM fact_indicator_values
           WHERE mo_id = $1 AND period_id = $2 AND ind_id = $3 AND version_id = $4`,
          [moId, periodId, ind.ind_id, versionId]
        );

        const score = valResult.rows.length > 0 ? valResult.rows[0].score : 0;
        totalScore += score;
        details[ind.ind_code] = {
          ind_id: ind.ind_id,
          name: ind.display_name,
          score: score
        };
      }

      return {
        score: Math.min(totalScore, 31), // Кэпируем на максимум 31
        details: details,
        max_possible: 31
      };
    } catch (error) {
      console.error('❌ Ошибка в calcPublicRating:', error.message);
      throw error;
    }
  }

  /**
   * Расчёт закрытого рейтинга (макс 35)
   */
  static async calcClosedRating(moId, periodId, versionId = 'v1') {
    try {
      // Получаем все закрытые показатели (8 штук)
      const indicators = await pool.query(
        `SELECT ind_id, ind_code, display_name
         FROM dim_indicators
         WHERE is_public = FALSE
         ORDER BY ind_id`
      );

      let totalScore = 0;
      const details = {};

      for (const ind of indicators.rows) {
        const valResult = await pool.query(
          `SELECT score FROM fact_indicator_values
           WHERE mo_id = $1 AND period_id = $2 AND ind_id = $3 AND version_id = $4`,
          [moId, periodId, ind.ind_id, versionId]
        );

        const score = valResult.rows.length > 0 ? valResult.rows[0].score : 0;
        totalScore += score;
        details[ind.ind_code] = {
          ind_id: ind.ind_id,
          name: ind.display_name,
          score: score
        };
      }

      return {
        score: Math.min(totalScore, 35), // Кэпируем на максимум 35
        details: details,
        max_possible: 35
      };
    } catch (error) {
      console.error('❌ Ошибка в calcClosedRating:', error.message);
      throw error;
    }
  }

  /**
   * Расчёт штрафов (отрицательные баллы)
   */
  static async calcPenalties(moId, periodId, versionId = 'v1') {
    try {
      const result = await pool.query(
        `SELECT COALESCE(SUM(penalty_score), 0)::NUMERIC as total_penalty
         FROM fact_penalties
         WHERE mo_id = $1 AND period_id = $2 AND version_id = $3 AND status = 'active'`,
        [moId, periodId, versionId]
      );

      return result.rows[0].total_penalty || 0;
    } catch (error) {
      console.error('❌ Ошибка в calcPenalties:', error.message);
      throw error;
    }
  }

  /**
   * Определение зоны по итоговому баллу
   */
  static getZone(totalScore, versionId = 'v1') {
    // Зелёная: 53-66, Жёлтая: 29-52, Красная: 0-28
    if (totalScore >= 53) return 'green';
    if (totalScore >= 29) return 'yellow';
    return 'red';
  }

  /**
   * Итоговый расчёт рейтинга для МО в период
   */
  static async calcTotalRating(moId, periodId, versionId = 'v1') {
    try {
      const publicRating = await this.calcPublicRating(moId, periodId, versionId);
      const closedRating = await this.calcClosedRating(moId, periodId, versionId);
      const penalties = await this.calcPenalties(moId, periodId, versionId);

      const totalScore = publicRating.score + closedRating.score + penalties;
      const zone = this.getZone(totalScore, versionId);

      return {
        score_public: publicRating.score,
        score_closed: closedRating.score,
        score_penalties: penalties,
        score_total: Math.max(0, totalScore), // Не ниже 0
        zone: zone,
        public_details: publicRating.details,
        closed_details: closedRating.details
      };
    } catch (error) {
      console.error('❌ Ошибка в calcTotalRating:', error.message);
      throw error;
    }
  }

  /**
   * Расчёт динамики между периодами
   */
  static async calcDynamics(moId, currentPeriodId, versionId = 'v1') {
    try {
      // Получаем текущий рейтинг
      const currentResult = await pool.query(
        `SELECT score_total FROM fact_summary_ratings
         WHERE mo_id = $1 AND period_id = $2 AND version_id = $3`,
        [moId, currentPeriodId, versionId]
      );

      const currentScore = currentResult.rows[0]?.score_total || 0;

      // Получаем предыдущий период (месяц назад)
      const prevPeriodResult = await pool.query(
        `SELECT p1.period_id FROM dim_period p1
         WHERE p1.date_to < (SELECT date_from FROM dim_period WHERE period_id = $1)
         ORDER BY p1.date_to DESC LIMIT 1`,
        [currentPeriodId]
      );

      if (prevPeriodResult.rows.length === 0) {
        return {
          current_score: currentScore,
          previous_score: null,
          change: null,
          trend: 'new'
        };
      }

      const prevPeriodId = prevPeriodResult.rows[0].period_id;
      const prevResult = await pool.query(
        `SELECT score_total FROM fact_summary_ratings
         WHERE mo_id = $1 AND period_id = $2 AND version_id = $3`,
        [moId, prevPeriodId, versionId]
      );

      const prevScore = prevResult.rows[0]?.score_total || 0;
      const change = currentScore - prevScore;
      let trend = 'stable';
      if (change > 1) trend = 'up';
      if (change < -1) trend = 'down';

      return {
        current_score: currentScore,
        previous_score: prevScore,
        change: change,
        trend: trend
      };
    } catch (error) {
      console.error('❌ Ошибка в calcDynamics:', error.message);
      throw error;
    }
  }

  /**
   * Массовый пересчёт рейтингов (при изменении методики)
   */
  static async recalculateAllRatings(versionId = 'v1') {
    try {
      console.log(`🔄 Запуск пересчёта рейтингов для версии ${versionId}...`);

      const moResult = await pool.query('SELECT mo_id FROM dim_municipalities');
      const periodResult = await pool.query('SELECT period_id FROM dim_period WHERE period_type = \'month\'');

      let processedCount = 0;

      for (const mo of moResult.rows) {
        for (const period of periodResult.rows) {
          const rating = await this.calcTotalRating(mo.mo_id, period.period_id, versionId);

          // Сохраняем или обновляем рейтинг
          await pool.query(
            `INSERT INTO fact_summary_ratings
             (mo_id, period_id, version_id, score_public, score_closed, score_penalties, score_total, zone)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (mo_id, period_id, version_id)
             DO UPDATE SET score_public = $4, score_closed = $5, score_penalties = $6, score_total = $7, zone = $8`,
            [mo.mo_id, period.period_id, versionId, rating.score_public, rating.score_closed,
             rating.score_penalties, rating.score_total, rating.zone]
          );

          processedCount++;
        }
      }

      console.log(`✅ Пересчёт завершён: ${processedCount} рейтингов обновлено`);
      return { processed: processedCount };
    } catch (error) {
      console.error('❌ Ошибка в recalculateAllRatings:', error.message);
      throw error;
    }
  }
}

module.exports = ScoringEngine;
