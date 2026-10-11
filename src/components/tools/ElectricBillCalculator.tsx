import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap, TrendingDown, Leaf, Calendar, Check, Stethoscope, Ruler
} from 'lucide-react'

interface ElectricBillCalculatorProps {
  onSwitchTab?: (tab: 'diagnostic' | 'calculator') => void
}

const POWER_CONSUMPTION: Record<'inverter' | 'non_inverter', Record<number, number>> = {
  non_inverter: {
    0.5: 450,
    0.75: 650,
    1.0: 900,
    1.5: 1300,
    2.0: 1800,
    2.5: 2100,
    3.0: 2600
  },
  inverter: {
    0.5: 350,
    0.75: 500,
    1.0: 750,
    1.5: 1100,
    2.0: 1500,
    2.5: 1800,
    3.0: 2200
  }
}

const DUTY_CYCLE = {
  non_inverter: 0.85,
  inverter: 0.55
}

const HP_OPTIONS = [
  { value: 0.75, label: '0.75 HP', room: 'Small Room (9-13 sqm)' },
  { value: 1.0, label: '1.0 HP', room: 'Bedroom / Studio (14-18 sqm)' },
  { value: 1.5, label: '1.5 HP', room: 'Living Room (18-25 sqm)' },
  { value: 2.0, label: '2.0 HP', room: 'Large Area (25-35 sqm)' },
  { value: 2.5, label: '2.5 HP', room: 'Master Suite (35-45 sqm)' },
  { value: 3.0, label: '3.0 HP', room: 'Commercial (45-55 sqm)' }
]

const USAGE_PATTERNS = [
  { id: 'light', label: 'Light Use', hours: 4, days: 25, desc: 'Night sleep hours only' },
  { id: 'moderate', label: 'Moderate', hours: 8, days: 28, desc: 'Afternoon + sleep' },
  { id: 'heavy', label: 'Heavy Use', hours: 12, days: 30, desc: 'Most of the day & night' },
  { id: 'always_on', label: 'Always On', hours: 18, days: 30, desc: 'Work from home / 24/7' }
]

export const ElectricBillCalculator: React.FC<ElectricBillCalculatorProps> = ({ onSwitchTab }) => {
  const [acType, setAcType] = useState<'inverter' | 'non_inverter'>('inverter')
  const [hp, setHp] = useState<number>(1.5)
  const [usagePattern, setUsagePattern] = useState<string>('moderate')
  const [meralcoRate, setMeralcoRate] = useState<number>(11.85)

  // Calculations
  const results = useMemo(() => {
    const pattern = USAGE_PATTERNS.find(p => p.id === usagePattern) || USAGE_PATTERNS[1]
    const hours = pattern.hours
    const days = pattern.days

    // Selected Unit Cost
    const watts = POWER_CONSUMPTION[acType][hp] || 900 * hp
    const duty = DUTY_CYCLE[acType]
    const monthlyKwh = (watts * hours * days * duty) / 1000
    const monthlyCost = Math.round(monthlyKwh * meralcoRate)
    const dailyCost = Math.round(monthlyCost / days)

    // Alternative Unit Cost
    const altType = acType === 'inverter' ? 'non_inverter' : 'inverter'
    const altWatts = POWER_CONSUMPTION[altType][hp] || 900 * hp
    const altDuty = DUTY_CYCLE[altType]
    const altMonthlyKwh = (altWatts * hours * days * altDuty) / 1000
    const altMonthlyCost = Math.round(altMonthlyKwh * meralcoRate)

    const monthlyDiff = Math.abs(monthlyCost - altMonthlyCost)
    const annualDiff = monthlyDiff * 12

    return {
      monthlyKwh: Math.round(monthlyKwh),
      monthlyCost,
      dailyCost,
      altMonthlyCost,
      monthlyDiff,
      annualDiff,
      hours,
      days
    }
  }, [acType, hp, usagePattern, meralcoRate])

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header Info */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <Zap className="w-3.5 h-3.5" />
          Meralco Rate Estimator
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          How much does your aircon cost to run per month?
        </h3>
        <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto mt-2">
          Calculate your electricity bill based on current Philippine Meralco rates and see the exact savings of an Inverter unit.
        </p>
      </div>

      <div className="space-y-6">
        {/* Controls Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 p-6 sm:p-8 space-y-7">
          {/* 1. AC Technology */}
          <div>
            <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              Air Conditioner Technology
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAcType('inverter')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                  acType === 'inverter'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                    <Leaf className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">Inverter AC</h5>
                    <p className="text-xs text-slate-500">Variable speed • Energy efficient</p>
                  </div>
                </div>
                {acType === 'inverter' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setAcType('non_inverter')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                  acType === 'non_inverter'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">Non-Inverter AC</h5>
                    <p className="text-xs text-slate-500">Traditional on/off compressor</p>
                  </div>
                </div>
                {acType === 'non_inverter' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>
            </div>
          </div>

          {/* 2. Horsepower */}
          <div>
            <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              Unit Capacity (Horsepower)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {HP_OPTIONS.map(opt => {
                const isSelected = hp === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setHp(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 block truncate mt-0.5">{opt.room}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Usage Pattern */}
          <div>
            <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">3</span>
              Daily Operating Pattern
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {USAGE_PATTERNS.map(p => {
                const isSelected = usagePattern === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setUsagePattern(p.id)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-900 block">{p.label}</span>
                    <span className="text-sm font-black text-emerald-700 block my-0.5">{p.hours}h / day</span>
                    <span className="text-[11px] text-slate-500 block leading-tight">{p.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Electricity Rate Setting */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-600">
              Electricity Tariff (Meralco Metro Manila Baseline):
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">₱</span>
              <input
                type="number"
                step="0.05"
                min="5"
                max="25"
                value={meralcoRate}
                onChange={e => setMeralcoRate(Number(e.target.value) || 11.85)}
                className="w-20 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-500 font-medium">per kWh</span>
            </div>
          </div>
        </div>

        {/* Results Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Monthly Cost Box */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                Estimated Monthly Cost
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  ₱{results.monthlyCost.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-slate-500">/ month</span>
              </div>
              <span className="text-xs text-slate-500 block mt-1">
                Approx. {results.monthlyKwh} kWh consumed per month
              </span>
            </div>

            {/* Daily Cost Box */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                Estimated Daily Running Cost
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight">
                  ₱{results.dailyCost.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-slate-500">/ day</span>
              </div>
              <span className="text-xs text-slate-500 block mt-1">
                Based on {results.hours} hours runtime at ₱{meralcoRate}/kWh
              </span>
            </div>
          </div>

          {/* Inverter Savings Showcase */}
          {acType === 'inverter' ? (
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0 mt-0.5">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-base font-bold text-emerald-950">
                  You're saving ₱{results.monthlyDiff.toLocaleString()} every month!
                </h5>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1 leading-relaxed">
                  Compared to a traditional non-inverter of the same {hp} HP capacity, this inverter saves you approx.{' '}
                  <strong>₱{results.annualDiff.toLocaleString()} per year</strong> in electricity expenses while maintaining consistent room temperature.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-base font-bold text-amber-950">
                  Switching to an Inverter could save you ₱{results.monthlyDiff.toLocaleString()} / month
                </h5>
                <p className="text-xs sm:text-sm text-amber-800 mt-1 leading-relaxed">
                  Your non-inverter runs at 100% compressor power continuously. Upgrading to a 5-star inverter saves up to{' '}
                  <strong>₱{results.annualDiff.toLocaleString()} every year</strong>, fully paying for the unit in roughly 12 to 16 months.
                </p>
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              to="/booking"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all hover:-translate-y-0.5"
            >
              <Calendar className="w-4 h-4" />
              Book Cleaning & Maintenance (Improves Efficiency by 20%)
            </Link>

            <a
              href="tel:+639177143810"
              className="w-full sm:w-auto text-center px-4 py-3 text-xs font-bold text-slate-700 hover:text-emerald-700 transition-colors"
            >
              Call ASHCOL for Inverter Advice →
            </a>
          </div>

          {onSwitchTab && (
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-500">
              <span>Related Tools:</span>
              <button
                type="button"
                onClick={() => onSwitchTab('diagnostic')}
                className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
              >
                <Stethoscope className="w-3.5 h-3.5" /> AC Diagnostic
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onSwitchTab('calculator')}
                className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
              >
                <Ruler className="w-3.5 h-3.5" /> Room Size Calculator
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default ElectricBillCalculator
