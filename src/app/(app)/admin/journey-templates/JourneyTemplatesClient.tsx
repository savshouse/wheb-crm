'use client'

import { useState, useTransition } from 'react'
import { saveJourneyTemplate } from '@/app/journey-actions'
import { Plus, Pencil, GripVertical, X, Check, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Link2 } from 'lucide-react'

type StepDef = { name: string; task_template_id: string | null }

type Template = {
  id: string
  name: string
  category: string
  description: string | null
  steps: StepDef[]
  is_active: boolean
}

type TaskTemplate = { id: string; name: string }

type Props = {
  initialTemplates: Template[]
  taskTemplates: TaskTemplate[]
}

function normaliseSteps(raw: any[]): StepDef[] {
  return (raw ?? []).map(s =>
    typeof s === 'string' ? { name: s, task_template_id: null } : s
  )
}

export default function JourneyTemplatesClient({ initialTemplates, taskTemplates }: Props) {
  const [templates, setTemplates] = useState<Template[]>(
    initialTemplates.map(t => ({ ...t, steps: normaliseSteps(t.steps as any[]) }))
  )
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const blankForm = {
    name: '', category: '', description: '',
    steps: [{ name: '', task_template_id: null }] as StepDef[],
    is_active: true,
  }
  const [form, setForm] = useState(blankForm)

  function startEdit(t: Template) {
    setForm({
      name: t.name,
      category: t.category,
      description: t.description ?? '',
      steps: t.steps.length ? t.steps.map(s => ({ ...s })) : [{ name: '', task_template_id: null }],
      is_active: t.is_active,
    })
    setEditingId(t.id)
    setExpandedId(t.id)
    setSaveError(null)
  }

  function startNew() {
    setForm(blankForm)
    setEditingId('new')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  function addStep() {
    setForm(f => ({ ...f, steps: [...f.steps, { name: '', task_template_id: null }] }))
  }

  function removeStep(i: number) {
    setForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))
  }

  function moveStep(from: number, to: number) {
    setForm(f => {
      const arr = [...f.steps]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { ...f, steps: arr }
    })
  }

  function updateStepName(i: number, name: string) {
    setForm(f => { const steps = [...f.steps]; steps[i] = { ...steps[i], name }; return { ...f, steps } })
  }

  function updateStepTemplate(i: number, task_template_id: string | null) {
    setForm(f => { const steps = [...f.steps]; steps[i] = { ...steps[i], task_template_id }; return { ...f, steps } })
  }

  function handleSave() {
    const steps = form.steps.map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name)
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    if (!form.category.trim()) { setSaveError('Category is required'); return }
    if (steps.length === 0) { setSaveError('At least one step is required'); return }

    startTransition(async () => {
      const { error } = await saveJourneyTemplate(
        editingId === 'new' ? null : editingId,
        { name: form.name.trim(), category: form.category.trim(), description: form.description.trim(), steps, is_active: form.is_active }
      )
      if (error) { setSaveError(error); return }

      if (editingId === 'new') {
        window.location.reload()
      } else {
        setTemplates(ts => ts.map(t => t.id === editingId
          ? { ...t, name: form.name.trim(), category: form.category.trim(), description: form.description.trim() || null, steps, is_active: form.is_active }
          : t
        ))
        setEditingId(null)
      }
    })
  }

  function toggleActive(t: Template) {
    startTransition(async () => {
      const { error } = await saveJourneyTemplate(t.id, {
        name: t.name, category: t.category, description: t.description ?? '',
        steps: t.steps, is_active: !t.is_active,
      })
      if (!error) setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, is_active: !x.is_active } : x))
    })
  }

  return (
    <div className="space-y-3">
      {templates.map(t => (
        <div key={t.id} className={`bg-white rounded-2xl border ${t.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'} overflow-hidden`}>
          {/* Header row */}
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{t.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t.category}</span>
                {!t.is_active && <span className="text-xs text-slate-400">Inactive</span>}
              </div>
              {t.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{t.description}</p>}
            </div>
            <span className="text-xs text-slate-400 shrink-0">{t.steps.length} step{t.steps.length !== 1 ? 's' : ''}</span>
            <button onClick={() => toggleActive(t)} className="text-slate-400 hover:text-slate-700" title={t.is_active ? 'Deactivate' : 'Activate'}>
              {t.is_active ? <ToggleRight size={20} className="text-blue-500" /> : <ToggleLeft size={20} />}
            </button>
            <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600 transition-colors">
              <Pencil size={15} />
            </button>
          </div>

          {/* Steps preview */}
          {expandedId === t.id && editingId !== t.id && (
            <div className="px-5 pb-4 border-t border-slate-100">
              <div className="flex flex-col gap-2 mt-3">
                {t.steps.map((step, i) => {
                  const linked = taskTemplates.find(tt => tt.id === step.task_template_id)
                  return (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="flex-1">{step.name}</span>
                      {linked && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                          <Link2 size={10} />
                          {linked.name}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {editingId === t.id && (
            <EditForm
              form={form}
              setForm={setForm}
              taskTemplates={taskTemplates}
              onAddStep={addStep}
              onRemoveStep={removeStep}
              onMoveStep={moveStep}
              onUpdateStepName={updateStepName}
              onUpdateStepTemplate={updateStepTemplate}
              onSave={handleSave}
              onCancel={cancelEdit}
              isPending={isPending}
              saveError={saveError}
            />
          )}
        </div>
      ))}

      {/* New template form */}
      {editingId === 'new' ? (
        <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">New template</p>
          </div>
          <EditForm
            form={form}
            setForm={setForm}
            taskTemplates={taskTemplates}
            onAddStep={addStep}
            onRemoveStep={removeStep}
            onMoveStep={moveStep}
            onUpdateStepName={updateStepName}
            onUpdateStepTemplate={updateStepTemplate}
            onSave={handleSave}
            onCancel={cancelEdit}
            isPending={isPending}
            saveError={saveError}
          />
        </div>
      ) : (
        <button
          onClick={startNew}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={16} />
          Add template
        </button>
      )}
    </div>
  )
}

type FormProps = {
  form: { name: string; category: string; description: string; steps: StepDef[]; is_active: boolean }
  setForm: React.Dispatch<React.SetStateAction<any>>
  taskTemplates: TaskTemplate[]
  onAddStep: () => void
  onRemoveStep: (i: number) => void
  onMoveStep: (from: number, to: number) => void
  onUpdateStepName: (i: number, val: string) => void
  onUpdateStepTemplate: (i: number, id: string | null) => void
  onSave: () => void
  onCancel: () => void
  isPending: boolean
  saveError: string | null
}

function EditForm({ form, setForm, taskTemplates, onAddStep, onRemoveStep, onMoveStep, onUpdateStepName, onUpdateStepTemplate, onSave, onCancel, isPending, saveError }: FormProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Template name *</label>
          <input
            value={form.name}
            onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Pension Transfer"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
          <input
            value={form.category}
            onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Pensions"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
        <input
          value={form.description}
          onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional short description"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-700">Steps (in order) *</label>
          <span className="text-xs text-slate-400">Optionally link a task template to auto-create tasks when the step activates</span>
        </div>
        <div className="space-y-2">
          {form.steps.map((step: StepDef, i: number) => (
            <div
              key={i}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null && dragIdx !== i) { onMoveStep(dragIdx, i); setDragIdx(null) } }}
              className="flex items-center gap-2"
            >
              <GripVertical size={14} className="text-slate-300 shrink-0 cursor-grab" />
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <input
                value={step.name}
                onChange={e => onUpdateStepName(i, e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Step ${i + 1} name`}
              />
              {/* Task template picker */}
              <select
                value={step.task_template_id ?? ''}
                onChange={e => onUpdateStepTemplate(i, e.target.value || null)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-600 min-w-0 max-w-44"
                title="Link a task template"
              >
                <option value="">No task template</option>
                {taskTemplates.map(tt => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
              {form.steps.length > 1 && (
                <button onClick={() => onRemoveStep(i)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onAddStep}
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Plus size={13} />
          Add step
        </button>
      </div>

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  )
}
