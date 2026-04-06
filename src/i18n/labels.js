/** Dashboard profile labels (format, frequency) by language */
export function getFormatLabel(lang, value) {
  const m = {
    en: { shorts: 'Shorts', longform: 'Long-form', both: 'Both' },
    es: { shorts: 'Shorts', longform: 'Videos largos', both: 'Ambos' },
    pt: { shorts: 'Shorts', longform: 'Vídeos longos', both: 'Ambos' },
    de: { shorts: 'Shorts', longform: 'Lange Videos', both: 'Beides' },
    fr: { shorts: 'Shorts', longform: 'Vidéos longues', both: 'Les deux' },
  }
  return (m[lang] || m.en)[value] || value
}

export function getFrequencyLabel(lang, value) {
  const m = {
    en: {
      daily: 'Daily',
      few_times: 'A few times per week',
      weekly: 'Weekly',
      occasionally: 'Occasionally',
    },
    es: {
      daily: 'A diario',
      few_times: 'Varias veces por semana',
      weekly: 'Semanalmente',
      occasionally: 'Ocasionalmente',
    },
    pt: {
      daily: 'Diariamente',
      few_times: 'Algumas vezes por semana',
      weekly: 'Semanalmente',
      occasionally: 'Ocasionalmente',
    },
    de: {
      daily: 'Täglich',
      few_times: 'Mehrmals pro Woche',
      weekly: 'Wöchentlich',
      occasionally: 'Gelegentlich',
    },
    fr: {
      daily: 'Quotidiennement',
      few_times: 'Quelques fois par semaine',
      weekly: 'Hebdomadaire',
      occasionally: 'Occasionnellement',
    },
  }
  return (m[lang] || m.en)[value] || value
}
