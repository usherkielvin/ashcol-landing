import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Stethoscope, ChevronRight, ChevronLeft, AlertTriangle,
  CheckCircle2, AlertCircle, Info, XCircle, Wrench,
  Phone, MessageSquare, Calculator, RotateCcw, Calendar
} from 'lucide-react'

export interface DiagnosticNode {
  id: string
  question: string
  helpText: string
  icon: string
}

export interface DiagnosticOption {
  id: string
  nodeId: string
  label: string
  icon: string
  nextNodeId?: string | null
  isTerminal?: boolean
  diagnosis?: string | null
  explanation?: string | null
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical' | null
  recommendation?: string | null
  estimatedCostMin?: number | null
  estimatedCostMax?: number | null
  ctaPrimaryText?: string | null
  ctaPrimaryAction?: string | null
}

const NODES: DiagnosticNode[] = [
  {
    id: 'start',
    question: "What's happening with your aircon?",
    helpText: "Select the option that best describes your situation",
    icon: "❄️"
  },
  {
    id: 'not_cooling',
    question: "How would you describe the cooling problem?",
    helpText: "This helps our technicians identify potential compressor, gas, or filter issues",
    icon: "🌡️"
  },
  {
    id: 'strange_noise',
    question: "What kind of noise is it making?",
    helpText: "Different sounds indicate loose parts, fan motor issues, or electrical vibrations",
    icon: "🔊"
  },
  {
    id: 'water_problem',
    question: "Where is the water coming from?",
    helpText: "Water leaks can result from clogged condensate lines or dirty evaporator coils",
    icon: "💧"
  },
  {
    id: 'ac_age',
    question: "How old is your aircon unit?",
    helpText: "Unit age determines whether a repair or an energy-efficient upgrade makes better financial sense",
    icon: "📅"
  }
]

const OPTIONS: DiagnosticOption[] = [
  // Root node options
  { id: 'opt-start-1', nodeId: 'start', label: 'Not cooling properly', icon: '🌡️', nextNodeId: 'not_cooling' },
  { id: 'opt-start-2', nodeId: 'start', label: 'Making strange noises', icon: '🔊', nextNodeId: 'strange_noise' },
  { id: 'opt-start-3', nodeId: 'start', label: 'Water leaking or dripping', icon: '💧', nextNodeId: 'water_problem' },
  { id: 'opt-start-4', nodeId: 'start', label: 'Electric bill unusually high', icon: '⚡', nextNodeId: 'ac_age' },
  {
    id: 'opt-start-5',
    nodeId: 'start',
    label: 'Need new AC (First time / Replacement)',
    icon: '🆕',
    isTerminal: true,
    diagnosis: 'Ready for a new energy-efficient AC unit',
    explanation: 'ASHCOL supplies and installs 16+ top-tier brands (Carrier, Daikin, Panasonic, Kolin, etc.). We help you choose the exact horsepower and inverter type to maximize savings.',
    severity: 'info',
    recommendation: 'consult',
    estimatedCostMin: 22000,
    estimatedCostMax: 75000,
    ctaPrimaryText: 'Book Free Assessment',
    ctaPrimaryAction: 'book'
  },

  // Not cooling sub-options
  { id: 'opt-cool-1', nodeId: 'not_cooling', label: 'Blowing air but not cold', icon: '💨', nextNodeId: 'ac_age' },
  {
    id: 'opt-cool-2',
    nodeId: 'not_cooling',
    label: 'Weak airflow / barely blowing',
    icon: '🌬️',
    isTerminal: true,
    diagnosis: 'Likely clogged air filters or dust buildup on coils',
    explanation: 'Restricted airflow is the single most common aircon issue. Dust buildup suffocates the blower wheel and evaporator coil, forcing the unit to consume 20-30% more power while delivering minimal cooling.',
    severity: 'low',
    recommendation: 'cleaning',
    estimatedCostMin: 1200,
    estimatedCostMax: 2200,
    ctaPrimaryText: 'Book Cleaning Service',
    ctaPrimaryAction: 'book'
  },
  { id: 'opt-cool-3', nodeId: 'not_cooling', label: 'Takes forever to cool the room', icon: '⏱️', nextNodeId: 'ac_age' },
  {
    id: 'opt-cool-4',
    nodeId: 'not_cooling',
    label: 'Turns on and off by itself (Short cycling)',
    icon: '🔄',
    isTerminal: true,
    diagnosis: 'Short cycling — possible sensor, capacitor, or refrigerant fault',
    explanation: 'When an AC turns off rapidly before reaching the set temperature, it places severe stress on the compressor. This is often caused by a faulty thermistor sensor, overheating condenser, or refrigerant leakage.',
    severity: 'medium',
    recommendation: 'repair',
    estimatedCostMin: 2000,
    estimatedCostMax: 5500,
    ctaPrimaryText: 'Book Diagnostic Visit',
    ctaPrimaryAction: 'book'
  },

  // Strange noise options
  {
    id: 'opt-noise-1',
    nodeId: 'strange_noise',
    label: 'Humming, buzzing, or vibrating',
    icon: '🐝',
    isTerminal: true,
    diagnosis: 'Likely failing run capacitor, loose bracket, or electrical vibration',
    explanation: 'A persistent humming or electrical buzz usually signals a strained fan motor or declining capacitor. Timely service prevents total motor burnout and saves costly compressor replacements.',
    severity: 'medium',
    recommendation: 'repair',
    estimatedCostMin: 1500,
    estimatedCostMax: 3800,
    ctaPrimaryText: 'Book Repair Service',
    ctaPrimaryAction: 'book'
  },
  {
    id: 'opt-noise-2',
    nodeId: 'strange_noise',
    label: 'Clicking, rattling, or squeaking',
    icon: '🔧',
    isTerminal: true,
    diagnosis: 'Loose blower wheel, foreign debris, or worn fan bearings',
    explanation: 'Rattling typically occurs when vibration shakes internal brackets loose or debris enters the outdoor condenser grill. ASHCOL technicians can tighten and balance the unit on-site.',
    severity: 'low',
    recommendation: 'repair',
    estimatedCostMin: 1000,
    estimatedCostMax: 2500,
    ctaPrimaryText: 'Book Technician Check',
    ctaPrimaryAction: 'book'
  },
  { id: 'opt-noise-3', nodeId: 'strange_noise', label: 'Grinding, metallic screeching, or loud banging', icon: '⚠️', nextNodeId: 'ac_age' },

  // Water leak options
  {
    id: 'opt-water-1',
    nodeId: 'water_problem',
    label: 'Dripping or pooling from indoor unit',
    icon: '🏠',
    isTerminal: true,
    diagnosis: 'Clogged condensate drain line, frozen coil thaw, or cracked drain pan',
    explanation: 'Condensate slime or algae commonly chokes the drain hose, causing cold condensation to overflow into your room and damage walls. A high-pressure chemical wash and drain flush resolves this immediately.',
    severity: 'low',
    recommendation: 'cleaning',
    estimatedCostMin: 1200,
    estimatedCostMax: 2200,
    ctaPrimaryText: 'Book General Cleaning & Flush',
    ctaPrimaryAction: 'book'
  },
  {
    id: 'opt-water-2',
    nodeId: 'water_problem',
    label: 'Water pooling heavily around outdoor condenser unit',
    icon: '🏢',
    isTerminal: true,
    diagnosis: 'Normal condensation drainage or minor pipe insulation tear',
    explanation: 'In humid Philippine weather, condensation on copper suction lines and outdoor valves is normal. However, if lines are iced over or puddling causes rust, pipe re-insulation is advised.',
    severity: 'info',
    recommendation: 'inspection',
    estimatedCostMin: 800,
    estimatedCostMax: 1800,
    ctaPrimaryText: 'Request Inspection',
    ctaPrimaryAction: 'book'
  },

  // Age options
  {
    id: 'opt-age-1',
    nodeId: 'ac_age',
    label: 'Under 5 years old (Relatively new)',
    icon: '✨',
    isTerminal: true,
    diagnosis: 'Targeted repair & maintenance recommended — unit has plenty of life',
    explanation: 'Your air conditioner is well within its prime operating years. A precision component fix (e.g. PCB repair, sensor replacement, or freon top-up) will restore full cooling performance reliably.',
    severity: 'low',
    recommendation: 'repair',
    estimatedCostMin: 1800,
    estimatedCostMax: 6500,
    ctaPrimaryText: 'Book Repair Service',
    ctaPrimaryAction: 'book'
  },
  {
    id: 'opt-age-2',
    nodeId: 'ac_age',
    label: '5 to 8 years old (Mid-life unit)',
    icon: '📆',
    isTerminal: true,
    diagnosis: 'Compare repair quote vs. upgrading to a high-efficiency Inverter',
    explanation: 'At 5-8 years, recurring repairs can add up quickly. If your repair estimate exceeds ₱4,000, modern inverter units consume up to 50% less electricity, saving ₱1,200 to ₱2,000 every single month on your electric bill.',
    severity: 'medium',
    recommendation: 'consult',
    estimatedCostMin: 2800,
    estimatedCostMax: 8500,
    ctaPrimaryText: 'Get Repair Quote',
    ctaPrimaryAction: 'book'
  },
  {
    id: 'opt-age-3',
    nodeId: 'ac_age',
    label: 'Over 8 years old (Aging / Obsolete unit)',
    icon: '🔧',
    isTerminal: true,
    diagnosis: 'Strong recommendation: Upgrade to a 5-star inverter unit',
    explanation: 'Units over 8 years old typically lose 25-40% efficiency and run on phased-out refrigerants. Upgrading to a new inverter unit pays for itself in 12–18 months through Meralco bill reductions, plus comes with a fresh warranty.',
    severity: 'high',
    recommendation: 'replace',
    estimatedCostMin: 24000,
    estimatedCostMax: 55000,
    ctaPrimaryText: 'Inquire About Inverter Upgrades',
    ctaPrimaryAction: 'book'
  }
]

const SEVERITY_CONFIG = {
  info: {
    icon: <Info className="w-5 h-5 text-blue-500" />,
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    title: 'Informational',
    border: 'border-blue-200 bg-blue-50/40'
  },
  low: {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    title: 'Routine Maintenance',
    border: 'border-emerald-200 bg-emerald-50/40'
  },
  medium: {
    icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    title: 'Needs Attention',
    border: 'border-amber-200 bg-amber-50/40'
  },
  high: {
    icon: <AlertTriangle className="w-5 h-5 text-orange-500" />,
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    title: 'Action Recommended',
    border: 'border-orange-200 bg-orange-50/40'
  },
  critical: {
    icon: <XCircle className="w-5 h-5 text-red-500" />,
    badge: 'bg-red-50 text-red-700 border-red-200',
    title: 'Urgent Attention',
    border: 'border-red-200 bg-red-50/40'
  }
}

interface DiagnosticFlowProps {
  onSwitchTab?: (tab: 'calculator' | 'bill') => void
}

export const DiagnosticFlow: React.FC<DiagnosticFlowProps> = ({ onSwitchTab }) => {
  const [history, setHistory] = useState<{ nodeId: string; optionId: string }[]>([])
  const [currentNodeId, setCurrentNodeId] = useState<string>('start')
  const [terminalOutcome, setTerminalOutcome] = useState<DiagnosticOption | null>(null)

  const currentNode = useMemo(() => NODES.find(n => n.id === currentNodeId), [currentNodeId])
  const currentOptions = useMemo(
    () => OPTIONS.filter(o => o.nodeId === currentNodeId),
    [currentNodeId]
  )

  const handleSelectOption = (option: DiagnosticOption) => {
    const updatedHistory = [...history, { nodeId: currentNodeId, optionId: option.id }]
    setHistory(updatedHistory)

    if (option.isTerminal) {
      setTerminalOutcome(option)
    } else if (option.nextNodeId) {
      setCurrentNodeId(option.nextNodeId)
    }
  }

  const handleBack = () => {
    if (terminalOutcome) {
      setTerminalOutcome(null)
      const lastStep = history[history.length - 1]
      if (lastStep) {
        setCurrentNodeId(lastStep.nodeId)
        setHistory(history.slice(0, -1))
      }
    } else if (history.length > 0) {
      const prevStep = history[history.length - 1]
      setCurrentNodeId(prevStep.nodeId)
      setHistory(history.slice(0, -1))
    }
  }

  const handleRestart = () => {
    setHistory([])
    setCurrentNodeId('start')
    setTerminalOutcome(null)
  }

  const progress = Math.min((history.length / 3) * 100, 100)

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header Info */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <Stethoscope className="w-3.5 h-3.5" />
          Interactive AC Troubleshooter
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          What seems to be the issue with your aircon?
        </h3>
        <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto mt-2">
          Answer a few quick questions to receive a preliminary diagnosis, typical repair cost range, and recommended action.
        </p>
      </div>

      {/* Progress Bar */}
      {!terminalOutcome && history.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
            <span>Diagnostic Progress</span>
            <span>Step {history.length + 1}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(progress, 20)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Main Interactive Card */}
      <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 p-6 sm:p-8 overflow-hidden transition-all">
        <AnimatePresence mode="wait">
          {terminalOutcome ? (
            /* Outcome / Diagnosis Result */
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {/* Severity Card */}
              {(() => {
                const sev = terminalOutcome.severity || 'info'
                const config = SEVERITY_CONFIG[sev]
                return (
                  <div className={`p-5 sm:p-6 rounded-2xl border ${config.border} flex items-start gap-4`}>
                    <div className="p-2.5 rounded-xl bg-white shadow-sm shrink-0 mt-0.5">
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.badge}`}>
                          {config.title}
                        </span>
                      </div>
                      <h4 className="text-lg sm:text-xl font-bold text-slate-900">
                        {terminalOutcome.diagnosis}
                      </h4>
                      <p className="text-sm sm:text-[15px] text-slate-700 leading-relaxed mt-2">
                        {terminalOutcome.explanation}
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* Estimated Cost Box */}
              {terminalOutcome.estimatedCostMin && terminalOutcome.estimatedCostMax && (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Typical Estimated Range in Metro Manila / Luzon
                    </span>
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                      ₱{terminalOutcome.estimatedCostMin.toLocaleString()} – ₱{terminalOutcome.estimatedCostMax.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 max-w-xs sm:text-right">
                    *Actual cost depends on unit capacity, refrigerant type, and specific spare parts required. Upfront quotes given before work begins.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <Link
                  to="/booking"
                  className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/25 transition-all hover:shadow-emerald-600/35 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Calendar className="w-5 h-5" />
                  {terminalOutcome.ctaPrimaryText || 'Book ASHCOL Service Online'}
                </Link>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href="tel:+639177143810"
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 font-semibold text-sm text-slate-800 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-emerald-600" />
                    Call +63 (917) 714 3810
                  </a>
                  <a
                    href="https://www.facebook.com/AshcolCorp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 hover:border-[#1877F2]/30 bg-white hover:bg-blue-50/50 font-semibold text-sm text-slate-800 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 text-[#1877F2]" />
                    Chat on Facebook
                  </a>
                </div>

                {onSwitchTab && (
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-500">
                    <span>Explore more tools:</span>
                    <button
                      onClick={() => onSwitchTab('calculator')}
                      className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Calculator className="w-3.5 h-3.5" /> Room Sizing Calculator
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => onSwitchTab('bill')}
                      className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                    >
                      ⚡ Electric Bill Predictor
                    </button>
                  </div>
                )}
              </div>

              {/* Reset / Start Over */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous Step
                </button>
                <button
                  onClick={handleRestart}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Start Over
                </button>
              </div>
            </motion.div>
          ) : (
            /* Questions & Options View */
            <motion.div
              key={currentNodeId}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {history.length > 0 && (
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}

              {currentNode && (
                <div className="text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl" role="img" aria-hidden="true">
                      {currentNode.icon}
                    </span>
                    <h4 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                      {currentNode.question}
                    </h4>
                  </div>
                  {currentNode.helpText && (
                    <p className="text-sm text-slate-500 ml-11">
                      {currentNode.helpText}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 pt-2">
                {currentOptions.map(option => (
                  <button
                    key={option.id}
                    onClick={() => handleSelectOption(option)}
                    className="group flex items-center justify-between p-4 sm:p-5 rounded-xl border-2 border-slate-200/80 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="text-2xl shrink-0" role="img" aria-hidden="true">
                        {option.icon}
                      </span>
                      <span className="font-semibold text-slate-800 text-sm sm:text-base group-hover:text-emerald-700 transition-colors">
                        {option.label}
                      </span>
                    </div>
                    <div className="flex items-center text-slate-400 group-hover:text-emerald-600 transition-colors pl-2">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>

              {history.length === 0 && (
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    Diagnoses based on ASHCOL 12+ years field expertise
                  </span>
                  <span>100% Free to use</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Immediate Helpline Footer */}
      <p className="text-center text-xs text-slate-500 mt-5">
        Need urgent assistance? Call our Central Support at{' '}
        <a href="tel:+639177143810" className="text-emerald-700 font-semibold hover:underline">
          +63 (917) 714 3810
        </a>{' '}
        (7 days a week, 8:00 AM – 7:00 PM).
      </p>
    </div>
  )
}
export default DiagnosticFlow
