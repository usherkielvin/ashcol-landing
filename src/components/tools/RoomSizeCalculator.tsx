import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ruler, ChevronDown, Check, Info, Calendar, Maximize2, Stethoscope, Zap
} from 'lucide-react'

interface RoomSizeCalculatorProps {
  onSwitchTab?: (tab: 'diagnostic' | 'bill') => void
}

const HP_TABLE: { hp: number; btu: number; label: string; desc: string }[] = [
  { hp: 0.5, btu: 5000, label: '0.5 HP', desc: 'Small bedroom, nursery, walk-in closet (up to 9 sqm)' },
  { hp: 0.75, btu: 7000, label: '0.75 HP', desc: 'Standard bedroom or home office (9 – 13 sqm)' },
  { hp: 1.0, btu: 9000, label: '1.0 HP', desc: 'Master bedroom, studio apartment (14 – 18 sqm)' },
  { hp: 1.5, btu: 12000, label: '1.5 HP', desc: 'Living room, open kitchen dining area (18 – 25 sqm)' },
  { hp: 2.0, btu: 18000, label: '2.0 HP', desc: 'Spacious living room, condo master suite (25 – 35 sqm)' },
  { hp: 2.5, btu: 21000, label: '2.5 HP', desc: 'Open-concept layout, retail shop (35 – 45 sqm)' },
  { hp: 3.0, btu: 24000, label: '3.0 HP', desc: 'Commercial space, restaurant floor, clinic (45 – 55 sqm)' },
  { hp: 4.0, btu: 36000, label: '4.0 HP', desc: 'Large office, event venue, conference room (55 – 75 sqm)' },
  { hp: 5.0, btu: 48000, label: '5.0 HP', desc: 'Industrial facility, showroom, enterprise floor (75+ sqm)' }
]

const SUN_OPTIONS = [
  { value: 'direct_sunlight', label: 'Direct Sunlight', sub: 'Large windows facing afternoon sun', mult: 1.3 },
  { value: 'partial_sunlight', label: 'Partial Sun', sub: 'Moderate sunlight & morning light', mult: 1.15 },
  { value: 'shaded', label: 'Mostly Shaded', sub: 'Minimal sun, covered or surrounded', mult: 1.0 }
]

const FLOOR_OPTIONS = [
  { value: 'top_floor', label: 'Top Floor / Attic', sub: 'Direct roof heat absorption', mult: 1.25 },
  { value: 'middle_floor', label: 'Middle Floor', sub: 'Standard residential floor', mult: 1.0 },
  { value: 'ground_floor', label: 'Ground Floor', sub: 'Coolest level of building', mult: 0.95 }
]

const FACING_OPTIONS = [
  { value: 'west_facing', label: 'West', sub: 'Intense afternoon heat', mult: 1.1 },
  { value: 'east_facing', label: 'East', sub: 'Mild morning sun', mult: 1.05 },
  { value: 'north_south_facing', label: 'North / South', sub: 'Less direct heat exposure', mult: 1.0 }
]

export const RoomSizeCalculator: React.FC<RoomSizeCalculatorProps> = ({ onSwitchTab }) => {
  const [roomSizeSqm, setRoomSizeSqm] = useState<number>(20)
  const [sunExposure, setSunExposure] = useState<string>('partial_sunlight')
  const [floorLevel, setFloorLevel] = useState<string>('middle_floor')
  const [occupants, setOccupants] = useState<number>(2)

  // Advanced toggles
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
  const [ceilingHeight, setCeilingHeight] = useState<number>(2.7)
  const [isKitchenAdjacent, setIsKitchenAdjacent] = useState<boolean>(false)
  const [glassSqm, setGlassSqm] = useState<number>(0)
  const [windowDirection, setWindowDirection] = useState<string>('north_south_facing')

  // Calculation Engine
  const calculation = useMemo(() => {
    const baseBtu = roomSizeSqm * 650
    const appliedMultipliers: Record<string, number> = {}
    let totalMult = 1.0

    // Sun exposure
    const sunItem = SUN_OPTIONS.find(s => s.value === sunExposure)
    if (sunItem && sunItem.mult !== 1.0) {
      appliedMultipliers[sunItem.label] = sunItem.mult
      totalMult *= sunItem.mult
    }

    // Floor level
    const floorItem = FLOOR_OPTIONS.find(f => f.value === floorLevel)
    if (floorItem && floorItem.mult !== 1.0) {
      appliedMultipliers[floorItem.label] = floorItem.mult
      totalMult *= floorItem.mult
    }

    // Occupants
    if (occupants > 2) {
      const occMult = 1 + (occupants - 2) * 0.05
      appliedMultipliers[`Extra occupants (${occupants} persons)`] = Math.round(occMult * 100) / 100
      totalMult *= occMult
    }

    // Ceiling height
    if (ceilingHeight > 2.7) {
      const ceilMult = 1 + (ceilingHeight - 2.7) * 0.08
      appliedMultipliers[`High ceiling (${ceilingHeight.toFixed(1)}m)`] = Math.round(ceilMult * 100) / 100
      totalMult *= ceilMult
    }

    // Kitchen
    if (isKitchenAdjacent) {
      appliedMultipliers['Kitchen heat load'] = 1.15
      totalMult *= 1.15
    }

    // Glass facade
    if (glassSqm > 0) {
      const glassMult = 1 + glassSqm * 0.02
      appliedMultipliers[`Glass exposure (${glassSqm} sqm)`] = Math.round(glassMult * 100) / 100
      totalMult *= glassMult
    }

    // Window orientation
    const facingItem = FACING_OPTIONS.find(f => f.value === windowDirection)
    if (facingItem && facingItem.mult !== 1.0) {
      appliedMultipliers[`${facingItem.label} facing`] = facingItem.mult
      totalMult *= facingItem.mult
    }

    const calculatedBtu = Math.round(baseBtu * totalMult)
    const roundedBtu = 500 * Math.ceil(calculatedBtu / 500)

    // Find recommended HP
    let recommended = HP_TABLE[HP_TABLE.length - 1]
    for (const tier of HP_TABLE) {
      if (tier.btu >= roundedBtu) {
        recommended = tier
        break
      }
    }

    const oversizePercent = Math.round(((recommended.btu - roundedBtu) / roundedBtu) * 100)

    return {
      baseBtu,
      calculatedBtu: roundedBtu,
      totalMultiplier: Math.round(totalMult * 100) / 100,
      appliedMultipliers,
      recommendedHp: recommended,
      oversizePercent,
      isOversized: oversizePercent > 18
    }
  }, [roomSizeSqm, sunExposure, floorLevel, occupants, ceilingHeight, isKitchenAdjacent, glassSqm, windowDirection])

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header Info */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <Ruler className="w-3.5 h-3.5" />
          HVAC Sizing Calculator
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          What size aircon (HP) do you actually need?
        </h3>
        <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto mt-2">
          Avoid an undersized AC that overworks and breaks down, or an oversized unit that spikes your electric bill.
        </p>
      </div>

      <div className="space-y-6">
        {/* Controls Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 p-6 sm:p-8 space-y-7">
          {/* 1. Room Floor Area */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                Room Floor Area
              </label>
              <div className="flex items-baseline gap-1 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                <span className="text-2xl font-black text-emerald-700">{roomSizeSqm}</span>
                <span className="text-xs font-bold text-emerald-800">sqm</span>
                <span className="text-xs text-slate-500 ml-1">
                  ({Math.round(roomSizeSqm * 10.764)} sq ft)
                </span>
              </div>
            </div>
            <input
              type="range"
              min={8}
              max={80}
              step={1}
              value={roomSizeSqm}
              onChange={e => setRoomSizeSqm(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-slate-400 font-medium mt-1">
              <span>8 sqm (Studio / Nook)</span>
              <span>30 sqm (Master suite)</span>
              <span>80 sqm (Open hall)</span>
            </div>
          </div>

          {/* 2. Sun Exposure */}
          <div>
            <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              Sunlight & Window Exposure
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SUN_OPTIONS.map(opt => {
                const isSelected = sunExposure === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSunExposure(opt.value)}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">{opt.sub}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Floor Level */}
          <div>
            <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">3</span>
              Floor Level in Building
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FLOOR_OPTIONS.map(opt => {
                const isSelected = floorLevel === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFloorLevel(opt.value)}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">{opt.sub}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 4. Occupants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                Regular Occupants
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOccupants(prev => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                >
                  −
                </button>
                <span className="text-xl font-bold text-slate-900 min-w-[2rem] text-center">
                  {occupants}
                </span>
                <button
                  type="button"
                  onClick={() => setOccupants(prev => Math.min(12, prev + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                >
                  +
                </button>
                <span className="text-xs font-semibold text-slate-500">people</span>
              </div>
            </div>
          </div>

          {/* Advanced Options Accordion */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
              {showAdvanced ? 'Hide Advanced Building Parameters' : 'Adjust Advanced Parameters (Ceiling, Kitchen, Glass)'}
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 pt-4 overflow-hidden"
                >
                  {/* Ceiling Height */}
                  <div>
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                      <span>Ceiling Height: {ceilingHeight.toFixed(1)} meters</span>
                      <span className="text-slate-400">Standard: 2.7m</span>
                    </div>
                    <input
                      type="range"
                      min={2.4}
                      max={5.0}
                      step={0.1}
                      value={ceilingHeight}
                      onChange={e => setCeilingHeight(Number(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>

                  {/* Kitchen Adjacent */}
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isKitchenAdjacent}
                      onChange={e => setIsKitchenAdjacent(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-800">
                      Adjacent to kitchen or cooking area (+15% thermal load)
                    </span>
                  </label>

                  {/* Glass windows */}
                  <div>
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                      <span>Glass facade / Sliding glass doors: {glassSqm} sqm</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={glassSqm}
                      onChange={e => setGlassSqm(Number(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>

                  {/* Window Facing */}
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block mb-2">Main windows face:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {FACING_OPTIONS.map(f => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setWindowDirection(f.value)}
                          className={`p-2 rounded-lg text-xs font-bold border transition-all ${
                            windowDirection === f.value
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Results Card */}
        <div className="bg-gradient-to-br from-slate-900 to-[#0F172A] rounded-2xl md:rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 text-white relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-white/10">
            <div className="text-center md:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Recommended Capacity for Your Space
              </span>
              <div className="flex items-baseline gap-3 mt-1 justify-center md:justify-start">
                <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                  {calculation.recommendedHp.label}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-slate-300">
                  ({calculation.calculatedBtu.toLocaleString()} BTU/hr)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md">
                {calculation.recommendedHp.desc}
              </p>
            </div>

            <div className="shrink-0 w-full md:w-auto">
              <Link
                to="/booking"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/30 transition-all hover:-translate-y-0.5"
              >
                <Calendar className="w-4 h-4" />
                Book Installation Assessment
              </Link>
            </div>
          </div>

          {/* Technical Multiplier Breakdown */}
          <div className="pt-5 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-200 mb-2">
              <Info className="w-4 h-4 text-emerald-400" />
              Cooling Load Breakdown:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span>Base load ({roomSizeSqm} sqm × 650 BTU):</span>
                <span className="font-semibold text-white">{calculation.baseBtu.toLocaleString()} BTU</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span>Total environmental multiplier:</span>
                <span className="font-semibold text-emerald-400">× {calculation.totalMultiplier}</span>
              </div>
              {Object.entries(calculation.appliedMultipliers).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-white/5">
                  <span className="truncate pr-2">{k}:</span>
                  <span className="font-semibold text-amber-300">× {v}</span>
                </div>
              ))}
            </div>

            {calculation.isOversized && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-xs">
                💡 <strong>ASHCOL Field Tip:</strong> The {calculation.recommendedHp.label} capacity includes a safe thermal reserve (+{calculation.oversizePercent}%). During extreme Philippine heat waves (38°C+), this ensures your compressor does not strain and reaches 22°C smoothly.
              </div>
            )}

            {onSwitchTab && (
              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-300">
                <span>Explore other tools:</span>
                <button
                  type="button"
                  onClick={() => onSwitchTab('diagnostic')}
                  className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Stethoscope className="w-3.5 h-3.5" /> AC Diagnostic
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => onSwitchTab('bill')}
                  className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Zap className="w-3.5 h-3.5" /> Electric Bill Predictor
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default RoomSizeCalculator
