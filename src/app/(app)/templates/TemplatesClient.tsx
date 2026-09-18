'use client'

import { useState, useTransition, Fragment, useRef } from 'react'
import { createTemplate, deleteTemplate, addTemplateItem, removeTemplateItem, updateTemplate, updateTemplateItem, importTemplate } from '@/app/actions'
import { Plus, Trash2, LayoutTemplate, ChevronDown, ChevronRight, Pencil, Check, X, Info, Download, Upload } from 'lucide-react'
import RemindersBell from '@/components/RemindersBell'
import { createClient } from '@/lib/supabase/client'

type Item = {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high'
  order_index: number
  relative_due_days: number | null
  parent_item_id: string | null
}

type Template = {
  id: string
  name: string
  description: string | null
  category: string | null
  items: Item[]
}

const priorityColour = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-green-100 text-green-700',
}

export default function TemplatesClient({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates]   = useState<Template[]>(initialTemplates)
  const [showNew, setShowNew]       = useState(false)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Editing template header
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const [editDesc, setEditDesc]   = useState('')
  const [editCat, setEditCat]     = useState('')

  // Editing a template item
  const [editingItem, setEditingItem]     = useState<string | null>(null)
  const [editItemTitle, setEditItemTitle] = useState('')
  const [editItemPri, setEditItemPri]     = useState('medium')
  const [editItemDays, setEditItemDays]   = useState('')

  // New template form
  const [newName, setNewName]   = useState('')
  const [newDesc, setNewDesc]   = useState('')
  const [newCat, setNewCat]     = useState('')
  const [newItems, setNewItems] = useState<Array<{ id: string; title: string; priority: string; relative_due_days: string }>>([])

  // Add item to existing template
  const [addingItemTo, setAddingItemTo]       = useState<string | null>(null)
  const [addingSubStepTo, setAddingSubStepTo] = useState<string | null>(null)
  const [addItemTitle, setAddItemTitle]       = useState('')
  const [addItemPriority, setAddItemPriority] = useState('medium')
  const [addItemDays, setAddItemDays]         = useState('')

  // Import state
  const [showImport, setShowImport]         = useState(false)
  const [importName, setImportName]         = useState('')
  const [importDesc, setImportDesc]         = useState('')
  const [importCat, setImportCat]           = useState('')
  const [importParsed, setImportParsed]     = useState<Array<{ title: string; priority: string; relative_due_days: number | null; level: number }> | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError]       = useState('')
  const [importing, setImporting]           = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Derive all categories
  const allCategories = Array.from(new Set(templates.map(t => t.category).filter(Boolean))) as string[]
  const grouped = allCategories.length > 0
    ? allCategories.map(cat => ({ cat, list: templates.filter(t => t.category === cat) })).concat(
        templates.filter(t => !t.category).length > 0
          ? [{ cat: 'Uncategorised', list: templates.filter(t => !t.category) }]
          : []
      )
    : [{ cat: '', list: templates }]

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function startEditTemplate(t: Template) {
    setEditingTemplate(t.id)
    setEditName(t.name)
    setEditDesc(t.description ?? '')
    setEditCat(t.category ?? '')
  }

  function startEditItem(item: Item) {
    setEditingItem(item.id)
    setEditItemTitle(item.title)
    setEditItemPri(item.priority)
    setEditItemDays(item.relative_due_days != null ? String(item.relative_due_days) : '')
  }

  async function saveTemplate(id: string) {
    startTransition(async () => {
      const { error } = await updateTemplate({ id, name: editName, description: editDesc || null, category: editCat || null })
      if (!error) {
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: editName, description: editDesc || null, category: editCat || null } : t))
        setEditingTemplate(null)
      }
    })
  }

  async function saveItem(id: string) {
    startTransition(async () => {
      const days = editItemDays ? parseInt(editItemDays) : null
      const { error } = await updateTemplateItem({
        id,
        title:             editItemTitle,
        priority:          editItemPri,
        relative_due_days: days,
      })
      if (!error) {
        setTemplates(prev => prev.map(t => ({
          ...t,
          items: t.items.map(item => item.id === id
            ? { ...item, title: editItemTitle, priority: editItemPri as Item['priority'], relative_due_days: days }
            : item),
        })))
        setEditingItem(null)
      }
    })
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    startTransition(async () => {
      await deleteTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    })
  }

  async function handleAddItem(templateId: string) {
    if (!addItemTitle.trim()) return
    const template = templates.find(t => t.id === templateId)
    const topLevelCount = template?.items.filter(i => !i.parent_item_id).length ?? 0
    startTransition(async () => {
      const { item, error } = await addTemplateItem({
        templateId,
        title: addItemTitle,
        priority: addItemPriority,
        orderIndex: topLevelCount,
        relativeDueDays: addItemDays ? parseInt(addItemDays) : null,
      })
      if (!error && item) {
        setTemplates(prev => prev.map(t => t.id === templateId
          ? { ...t, items: [...t.items, { id: item.id, title: item.title, priority: item.priority as Item['priority'], order_index: item.order_index, relative_due_days: item.relative_due_days, parent_item_id: null }] }
          : t))
        setAddingItemTo(null)
        setAddItemTitle('')
        setAddItemDays('')
        setAddItemPriority('medium')
      }
    })
  }

  async function handleAddSubStep(templateId: string, parentItemId: string) {
    if (!addItemTitle.trim()) return
    const template = templates.find(t => t.id === templateId)
    const siblingCount = template?.items.filter(i => i.parent_item_id === parentItemId).length ?? 0
    startTransition(async () => {
      const { item, error } = await addTemplateItem({
        templateId,
        title: addItemTitle,
        priority: addItemPriority,
        orderIndex: siblingCount,
        relativeDueDays: addItemDays ? parseInt(addItemDays) : null,
        parentItemId,
      })
      if (!error && item) {
        setTemplates(prev => prev.map(t => t.id === templateId
          ? { ...t, items: [...t.items, { id: item.id, title: item.title, priority: item.priority as Item['priority'], order_index: item.order_index, relative_due_days: item.relative_due_days, parent_item_id: parentItemId }] }
          : t))
        setAddingSubStepTo(null)
        setAddItemTitle('')
        setAddItemDays('')
        setAddItemPriority('medium')
      }
    })
  }

  async function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      const { error } = await removeTemplateItem(itemId)
      if (!error) {
        setTemplates(prev => prev.map(t => ({ ...t, items: t.items.filter(item => item.id !== itemId) })))
      }
    })
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    startTransition(async () => {
      const { id, error } = await createTemplate({
        name: newName,
        description: newDesc || null,
        category: newCat || null,
        items: newItems.filter(i => i.title.trim()).map((i, idx) => ({
          title: i.title, priority: i.priority, order_index: idx,
          relative_due_days: i.relative_due_days ? parseInt(i.relative_due_days) : null,
        })),
      })
      if (!error && id) {
        const { data: items } = await createClient()
          .from('task_template_items')
          .select('id, title, priority, order_index, relative_due_days, parent_item_id')
          .eq('template_id', id)
          .order('order_index')
        setTemplates(prev => [...prev, {
          id,
          name: newName,
          description: newDesc || null,
          category: newCat || null,
          items: (items ?? []) as Item[],
        }])
        setShowNew(false); setNewName(''); setNewDesc(''); setNewCat(''); setNewItems([])
      }
    })
  }

  // ── Export ──────────────────────────────────────────────────────
  function handleExportTemplate(template: Template) {
    const sorted = [...template.items].sort((a, b) => a.order_index - b.order_index)
    const topLevel = sorted.filter(i => !i.parent_item_id)
    const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"` : v
    const rows = ['level,title,priority,relative_due_days']
    for (const parent of topLevel) {
      rows.push(`0,${esc(parent.title)},${parent.priority},${parent.relative_due_days ?? ''}`)
      sorted.filter(c => c.parent_item_id === parent.id).forEach(child => {
        rows.push(`1,${esc(child.title)},${child.priority},${child.relative_due_days ?? ''}`)
      })
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wheb-template-${template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import ──────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    setImportError('')
    const reader = new FileReader()
    reader.onload = evt => {
      const text = evt.target?.result as string
      const lines = text.trim().split('\n').filter(l => l.trim())
      if (lines.length < 2) { setImportError('CSV must have a header row and at least one step.'); return }
      const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const levelIdx = header.indexOf('level')
      const titleIdx = header.indexOf('title')
      const priIdx   = header.indexOf('priority')
      const daysIdx  = header.indexOf('relative_due_days')
      if (titleIdx === -1) { setImportError('CSV must have a "title" column.'); return }
      const parsed = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
        const days = daysIdx !== -1 && cols[daysIdx] ? parseInt(cols[daysIdx]) : null
        return {
          level:             levelIdx !== -1 ? (parseInt(cols[levelIdx]) || 0) : 0,
          title:             cols[titleIdx] ?? '',
          priority:          (['low','medium','high'].includes(cols[priIdx] ?? '') ? cols[priIdx] : 'medium') as string,
          relative_due_days: isNaN(days as number) ? null : days,
        }
      }).filter(r => r.title.trim())
      if (!parsed.length) { setImportError('No valid rows found.'); return }
      setImportParsed(parsed)
      // Pre-fill name from filename if empty
      if (!importName) setImportName(file.name.replace(/\.csv$/i, '').replace(/[-_]+/g, ' '))
    }
    reader.readAsText(file)
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!importParsed || !importName.trim()) return
    setImporting(true)
    const { id, error } = await importTemplate({
      name:        importName.trim(),
      description: importDesc || null,
      category:    importCat  || null,
      items:       importParsed,
    })
    if (error || !id) { setImportError(error ?? 'Import failed'); setImporting(false); return }
    // Fetch the newly created items and add to state
    const { data: items } = await createClient()
      .from('task_template_items')
      .select('id, title, priority, order_index, relative_due_days, parent_item_id')
      .eq('template_id', id)
      .order('order_index')
    setTemplates(prev => [...prev, {
      id,
      name:        importName.trim(),
      description: importDesc || null,
      category:    importCat  || null,
      items:       (items ?? []) as Item[],
    }])
    setShowImport(false); setImportName(''); setImportDesc(''); setImportCat('')
    setImportParsed(null); setImportFileName(''); setImportError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setImporting(false)
  }

  const inputClass = 'px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Task Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Reusable step-by-step workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowImport(!showImport); setShowNew(false) }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Upload size={15} />Import CSV
          </button>
          <button
            onClick={() => { setShowNew(!showNew); setShowImport(false) }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />New template
          </button>
          <RemindersBell />
        </div>
      </div>

      {/* How to apply */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">How to apply a template:</span> Open any client or person, click the <strong>+</strong> button in the Tasks panel on the right, enter a task title, then select a template from the <em>"Apply template"</em> dropdown. All steps are created as sub-tasks automatically.
        </div>
      </div>

      {/* Import form */}
      {showImport && (
        <form onSubmit={handleImportSubmit} className="bg-white rounded-xl border border-blue-200 p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Upload size={14} />Import template from CSV</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Template name *</label>
              <input value={importName} onChange={e => setImportName(e.target.value)} required placeholder="e.g. Mortgage Application" className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <input value={importCat} onChange={e => setImportCat(e.target.value)} placeholder="e.g. Mortgage" className={`w-full ${inputClass}`} list="cat-suggestions" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input value={importDesc} onChange={e => setImportDesc(e.target.value)} placeholder="Optional description" className={`w-full ${inputClass}`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">CSV file</label>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer" />
            <p className="text-xs text-slate-400 mt-1">Expected columns: <code className="bg-slate-100 px-1 rounded">level</code>, <code className="bg-slate-100 px-1 rounded">title</code>, <code className="bg-slate-100 px-1 rounded">priority</code>, <code className="bg-slate-100 px-1 rounded">relative_due_days</code> — use level 0 for steps, level 1 for sub-steps</p>
          </div>

          {importError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{importError}</p>
          )}

          {importParsed && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Preview — {importParsed.length} rows parsed from {importFileName}</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                {importParsed.map((row, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 ${row.level === 1 ? 'pl-8 bg-slate-50/60' : ''}`}>
                    <span className="text-xs text-slate-400 shrink-0 w-4">{row.level === 0 ? '●' : '○'}</span>
                    <span className="text-xs text-slate-700 flex-1">{row.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[row.priority as keyof typeof priorityColour] ?? 'bg-slate-100 text-slate-600'}`}>{row.priority}</span>
                    {row.relative_due_days != null && <span className="text-xs text-slate-400">+{row.relative_due_days}d</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={importing || !importParsed || !importName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {importing ? 'Importing…' : `Import${importParsed ? ` (${importParsed.length} steps)` : ''}`}
            </button>
            <button type="button" onClick={() => { setShowImport(false); setImportParsed(null); setImportError(''); setImportFileName(''); if (fileInputRef.current) fileInputRef.current.value = '' }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {/* New template form */}
      {showNew && (
        <form onSubmit={handleCreateTemplate} className="bg-white rounded-xl border border-blue-200 p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">New template</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Template name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. Set up new pension scheme" className={`w-full ${inputClass}`} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="e.g. Pension, Protection, Onboarding" className={`w-full ${inputClass}`} list="cat-suggestions" />
              <datalist id="cat-suggestions">
                {allCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="When to use this..." className={`w-full ${inputClass}`} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Steps</label>
              <button type="button" onClick={() => setNewItems(p => [...p, { id: crypto.randomUUID(), title: '', priority: 'medium', relative_due_days: '' }])} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus size={12} />Add step
              </button>
            </div>
            {newItems.length === 0 ? (
              <div onClick={() => setNewItems(p => [...p, { id: crypto.randomUUID(), title: '', priority: 'medium', relative_due_days: '' }])} className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 text-xs text-slate-400">
                Click to add first step
              </div>
            ) : (
              <div className="space-y-2">
                {newItems.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-400 shrink-0 w-5">{i + 1}.</span>
                    <input value={item.title} onChange={e => setNewItems(p => p.map(x => x.id === item.id ? { ...x, title: e.target.value } : x))} placeholder="Step description..." className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <select value={item.priority} onChange={e => setNewItems(p => p.map(x => x.id === item.id ? { ...x, priority: e.target.value } : x))} className="text-xs rounded border border-slate-300 px-1.5 py-1 focus:outline-none">
                      <option value="low">Low</option>
                      <option value="medium">Med</option>
                      <option value="high">High</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <input type="number" value={item.relative_due_days} onChange={e => setNewItems(p => p.map(x => x.id === item.id ? { ...x, relative_due_days: e.target.value } : x))} placeholder="Days" min="0" className="w-14 px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                      <span className="text-xs text-slate-400">days</span>
                    </div>
                    <button type="button" onClick={() => setNewItems(p => p.filter(x => x.id !== item.id))} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setNewItems(p => [...p, { id: crypto.randomUUID(), title: '', priority: 'medium', relative_due_days: '' }])} className="w-full py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-600">+ Add step</button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1.5">Days = due date offset from the parent task's base date (leave blank = no due date)</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? 'Creating...' : `Create template${newItems.filter(i => i.title.trim()).length > 0 ? ` (${newItems.filter(i => i.title.trim()).length} steps)` : ''}`}
            </button>
            <button type="button" onClick={() => { setShowNew(false); setNewItems([]); setNewName('') }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Template list grouped by category */}
      {templates.length === 0 && !showNew ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <LayoutTemplate size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-slate-700 font-medium mb-1">No templates yet</h3>
          <p className="text-sm text-slate-500 mb-4">Create your first workflow — e.g. "Set up new pension scheme"</p>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={15} />Create first template
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, list }) => (
            <div key={cat}>
              {cat && (
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{cat}</h2>
              )}
              <div className="space-y-3">
                {list.map(template => {
                  const isExpanded = expanded.has(template.id)
                  const isEditing  = editingTemplate === template.id
                  const sorted = [...(template.items ?? [])].sort((a, b) => a.order_index - b.order_index)

                  return (
                    <div key={template.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Template header */}
                      <div className="px-5 py-4 flex items-center gap-3">
                        <button onClick={() => toggleExpand(template.id)} className="shrink-0 text-slate-400 hover:text-slate-600">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>

                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 min-w-40 px-2 py-1 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" />
                            <input value={editCat} onChange={e => setEditCat(e.target.value)} placeholder="Category" list="cat-suggestions" className="w-36 px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                            <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="w-48 px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                            <button onClick={() => saveTemplate(template.id)} disabled={isPending} className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-white hover:bg-green-600 disabled:opacity-50"><Check size={14} /></button>
                            <button onClick={() => setEditingTemplate(null)} className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-50"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-900">{template.name}</h3>
                              <span className="text-xs text-slate-400">{sorted.length} step{sorted.length !== 1 ? 's' : ''}</span>
                              {template.category && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{template.category}</span>
                              )}
                            </div>
                            {template.description && <p className="text-xs text-slate-500 mt-0.5">{template.description}</p>}
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleExportTemplate(template)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Export as CSV"><Download size={13} /></button>
                            <button onClick={() => startEditTemplate(template)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><Pencil size={13} /></button>
                            <button onClick={() => handleDeleteTemplate(template.id)} disabled={isPending} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>

                      {/* Steps */}
                      {isExpanded && (
                        <div className="border-t border-slate-100">
                          {(() => {
                            const topLevel = sorted.filter(i => !i.parent_item_id)
                            const alpha = (n: number) => String.fromCharCode(97 + n)
                            const editRow = (item: Item, label: string, indent: boolean) => (
                              <div className={`${indent ? 'pl-10 pr-5' : 'px-5'} py-2 flex items-center gap-2 flex-wrap`}>
                                <span className="text-xs text-slate-400 shrink-0 w-7">{label}</span>
                                <input value={editItemTitle} onChange={e => setEditItemTitle(e.target.value)} className="flex-1 min-w-32 px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => e.key === 'Enter' && saveItem(item.id)} autoFocus />
                                <select value={editItemPri} onChange={e => setEditItemPri(e.target.value)} className="text-xs rounded border border-slate-300 px-1.5 py-1 focus:outline-none">
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                                <div className="flex items-center gap-1">
                                  <input type="number" value={editItemDays} onChange={e => setEditItemDays(e.target.value)} placeholder="Days" min="0" className="w-14 px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                                  <span className="text-xs text-slate-400">days</span>
                                </div>
                                <button onClick={() => saveItem(item.id)} disabled={isPending} className="w-6 h-6 rounded bg-green-500 flex items-center justify-center text-white hover:bg-green-600 disabled:opacity-50"><Check size={12} /></button>
                                <button onClick={() => setEditingItem(null)} className="w-6 h-6 rounded border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-50"><X size={12} /></button>
                              </div>
                            )
                            return (
                              <>
                                {topLevel.map((item, pi) => {
                                  const children = sorted.filter(c => c.parent_item_id === item.id)
                                  return (
                                    <Fragment key={item.id}>
                                      {/* Parent step */}
                                      <div className="border-b border-slate-50 hover:bg-slate-50 group">
                                        {editingItem === item.id ? editRow(item, `${pi + 1}.`, false) : (
                                          <div className="flex items-center gap-3 px-5 py-2.5">
                                            <span className="text-xs text-slate-400 shrink-0 w-5">{pi + 1}.</span>
                                            <p className="flex-1 text-sm font-medium text-slate-800">{item.title}</p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[item.priority]}`}>{item.priority}</span>
                                            {item.relative_due_days != null && <span className="text-xs text-slate-400">+{item.relative_due_days}d</span>}
                                            <div className="flex items-center gap-1">
                                              <button onClick={() => startEditItem(item)} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><Pencil size={11} /></button>
                                              <button onClick={() => handleRemoveItem(item.id)} disabled={isPending} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={11} /></button>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Sub-steps */}
                                      {children.map((child, ci) => (
                                        <div key={child.id} className="border-b border-slate-50 hover:bg-slate-50/80 group bg-slate-50/40">
                                          {editingItem === child.id ? editRow(child, `${pi + 1}${alpha(ci)}.`, true) : (
                                            <div className="flex items-center gap-3 pl-10 pr-5 py-2">
                                              <span className="text-xs text-slate-400 shrink-0 w-7">{pi + 1}{alpha(ci)}.</span>
                                              <p className="flex-1 text-xs text-slate-700">{child.title}</p>
                                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[child.priority]}`}>{child.priority}</span>
                                              {child.relative_due_days != null && <span className="text-xs text-slate-400">+{child.relative_due_days}d</span>}
                                              <div className="flex items-center gap-1">
                                                <button onClick={() => startEditItem(child)} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><Pencil size={11} /></button>
                                                <button onClick={() => handleRemoveItem(child.id)} disabled={isPending} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={11} /></button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}

                                      {/* Add sub-step inline */}
                                      {addingSubStepTo === item.id ? (
                                        <div className="pl-10 pr-5 py-2.5 bg-blue-50/40 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                                          <input value={addItemTitle} onChange={e => setAddItemTitle(e.target.value)} placeholder="Sub-step title…" className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-32" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddSubStep(template.id, item.id)} />
                                          <select value={addItemPriority} onChange={e => setAddItemPriority(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none">
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                          </select>
                                          <div className="flex items-center gap-1">
                                            <input type="number" value={addItemDays} onChange={e => setAddItemDays(e.target.value)} placeholder="Days" min="0" className="w-14 px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none" />
                                            <span className="text-xs text-slate-400">days</span>
                                          </div>
                                          <button onClick={() => handleAddSubStep(template.id, item.id)} disabled={isPending || !addItemTitle.trim()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Add</button>
                                          <button onClick={() => { setAddingSubStepTo(null); setAddItemTitle('') }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
                                        </div>
                                      ) : (
                                        <div className="pl-10 border-b border-slate-50">
                                          <button onClick={() => { setAddingSubStepTo(item.id); setAddingItemTo(null) }} className="py-1.5 text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
                                            <Plus size={11} />Add sub-step
                                          </button>
                                        </div>
                                      )}
                                    </Fragment>
                                  )
                                })}

                                {/* Add top-level step */}
                                {addingItemTo === template.id ? (
                                  <div className="px-5 py-3 bg-slate-50 flex items-center gap-2 flex-wrap">
                                    <input value={addItemTitle} onChange={e => setAddItemTitle(e.target.value)} placeholder="Step title…" className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-40" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddItem(template.id)} />
                                    <select value={addItemPriority} onChange={e => setAddItemPriority(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none">
                                      <option value="low">Low</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">High</option>
                                    </select>
                                    <div className="flex items-center gap-1">
                                      <input type="number" value={addItemDays} onChange={e => setAddItemDays(e.target.value)} placeholder="Days" min="0" className="w-16 px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none" />
                                      <span className="text-xs text-slate-400">days</span>
                                    </div>
                                    <button onClick={() => handleAddItem(template.id)} disabled={isPending || !addItemTitle.trim()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Add</button>
                                    <button onClick={() => { setAddingItemTo(null); setAddItemTitle('') }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setAddingItemTo(template.id); setAddingSubStepTo(null) }} className="w-full px-5 py-2.5 text-left text-xs text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                                    <Plus size={13} />Add step
                                  </button>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
