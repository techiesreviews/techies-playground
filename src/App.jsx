import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BookmarkIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ClockIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderOpenIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { installPlugin, installTheme, zipWpContent } from '@wp-playground/blueprints'
import { startPlaygroundWeb } from '@wp-playground/client'
import {
  DEFAULT_RECIPE,
  buildPlaygroundBlueprint,
  downloadRecipe,
  extractVersionHint,
  normalizePluginId,
  pluginLabelFromFilename,
  validateRecipe,
} from './lib/recipe'
import {
  fetchWordPressVersionOptions,
  getLatestStableWordPressVersion,
  preserveSelectedWordPressVersion,
  WORDPRESS_VERSION_FALLBACK_OPTIONS,
} from './lib/wordpress-versions'
import { searchWordPressOrgPlugins } from './lib/wordpress-org-plugins'
import { searchWordPressOrgThemes } from './lib/wordpress-org-themes'
import {
  parseSavedRecipes,
  replaceSavedRecipe,
  SAVED_RECIPES_KEY,
  serializeSavedRecipes,
  upsertSavedRecipe,
} from './lib/saved-recipes'
import {
  forgetPluginRecency,
  markPluginSelected,
  parsePluginRecency,
  PLUGIN_RECENCY_KEY,
  sortAndFilterPlugins,
  THEME_RECENCY_KEY,
} from './lib/plugin-preferences'
import {
  appendSpinup,
  parseSpinupHistory,
  serializeSpinupHistory,
  SPINUP_HISTORY_KEY,
} from './lib/spinup-history'
import {
  migrateStorageDefault,
  persistedSiteId,
  shouldWarnBeforeUnload,
  spinupPersistenceLabel,
} from './lib/playground-persistence'
import {
  addLicense,
  copyLicenseToClipboard,
  createLicenseVault,
  deleteLicense,
  getLicenseVaultStatus,
  listLicenseMetadata,
  resetLicenseVault,
  unlockLicenseVault,
} from './lib/license-vault'
import {
  assertZipFile,
  getPlugin,
  getTheme,
  listPlugins,
  listThemes,
  removePlugin,
  removeTheme,
  savePlugin,
  saveTheme,
} from './lib/vault'

const DRAFT_KEY = 'private-playground-launcher:draft'
const PERSISTED_SITES_KEY = 'private-playground-launcher:persisted-sites'
const STORAGE_DEFAULT_MIGRATION_KEY = 'private-playground-launcher:browser-storage-default-v1'

function readPersistedSites() {
  try {
    const value = JSON.parse(localStorage.getItem(PERSISTED_SITES_KEY))
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberPersistedSite(id) {
  const sites = readPersistedSites()
  sites.add(id)
  localStorage.setItem(PERSISTED_SITES_KEY, JSON.stringify([...sites]))
}

function Select({ id, label, value, onChange, children }) {
  return (
    <label htmlFor={id} className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
      {label}
      <span className="inline-grid grid-cols-[1fr_--spacing(8)]">
        <select
          id={id}
          name={id}
          value={value}
          onChange={onChange}
          className="col-span-full row-start-1 appearance-none rounded-lg bg-white py-2.5 pr-8 pl-3 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6"
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center fill-neutral-500" />
      </span>
    </label>
  )
}

function TextField({ id, label, value, onChange, type = 'text', placeholder = '', description = '' }) {
  return (
    <label htmlFor={id} className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
      {label}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="rounded-lg bg-white px-3 py-2.5 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none placeholder:text-neutral-400 focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6"
      />
      {description && <span className="font-normal text-neutral-500">{description}</span>}
    </label>
  )
}

function Checkbox({ id, checked, onChange, label, description }) {
  return (
    <label htmlFor={id} className="flex min-w-0 cursor-pointer items-start gap-3">
      <span className="flex h-lh shrink-0 items-center text-base sm:text-sm">
        <span className="group inline-grid size-5 grid-cols-1 sm:size-4">
          <input
            id={id}
            name={id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            className="col-start-1 row-start-1 appearance-none rounded-sm border border-neutral-300 bg-white checked:border-teal-700 checked:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 forced-colors:appearance-auto"
          />
          <svg viewBox="0 0 14 14" fill="none" className="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-white group-not-has-checked:opacity-0">
            <path d="M3 8L6 11L11 3.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span className="min-w-0">
        <span className="font-medium text-neutral-900">{label}</span>
        {description && <span className="text-neutral-600"> — {description}</span>}
      </span>
    </label>
  )
}

function Radio({ id, name, checked, onChange, label, description }) {
  return (
    <label htmlFor={id} className="flex min-w-0 cursor-pointer items-start gap-3">
      <span className="flex h-lh shrink-0 items-center text-base sm:text-sm">
        <span className="group inline-grid size-5 grid-cols-1 sm:size-4">
          <input
            id={id}
            name={name}
            type="radio"
            checked={checked}
            onChange={onChange}
            className="col-start-1 row-start-1 appearance-none rounded-full border border-neutral-300 bg-white checked:border-teal-700 checked:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 forced-colors:appearance-auto"
          />
          <span className="pointer-events-none col-start-1 row-start-1 size-2/5 self-center justify-self-center rounded-full bg-white group-not-has-checked:opacity-0" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="font-medium text-neutral-900">{label}</span>
        {description && <span className="text-neutral-600"> — {description}</span>}
      </span>
    </label>
  )
}

function AppHeader({ onImportRecipe }) {
  const recipeInput = useRef(null)

  return (
    <header className="border-b border-neutral-950/10 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <a href="/" aria-label="Homepage" className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
          <CircleStackIcon className="size-4 shrink-0 fill-teal-700" />
          <span className="truncate font-semibold text-neutral-950">Techies Playground</span>
        </a>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden items-center gap-1.5 text-sm/6 text-neutral-600 sm:flex">
            <LockClosedIcon className="size-4 shrink-0 fill-teal-700" />
            Browser-local vault
          </p>
          <button
            type="button"
            onClick={() => recipeInput.current?.click()}
            className="relative inline-flex items-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
            <ArrowUpTrayIcon className="size-4 shrink-0 fill-neutral-500" />
            <span className="max-sm:hidden">Import recipe</span>
            <span className="sm:hidden">Import</span>
          </button>
          <input ref={recipeInput} type="file" name="recipe" accept="application/json,.json" className="hidden" onChange={onImportRecipe} />
        </div>
      </div>
    </header>
  )
}

function SavedRecipeRow({ record, active, editing, missingCount, onChoose, onEdit, onRemove }) {
  const pluginCount = record.recipe.plugins.length + record.recipe.repositoryPlugins.length
  const themeCount = record.recipe.theme || record.recipe.repositoryTheme ? 1 : 0
  const packageSummary = [
    `${pluginCount} plugin${pluginCount === 1 ? '' : 's'}`,
    themeCount ? '1 theme' : '',
  ].filter(Boolean).join(', ')
  return (
    <div className={`group relative min-w-0 border-t border-neutral-950/8 py-4 first:border-t-0 first:pt-0 last:pb-0 ${active || editing ? 'text-neutral-950' : 'text-neutral-700'}`}>
      <button
        type="button"
        onClick={() => onChoose(record)}
        className={`w-full min-w-0 rounded-lg p-2 pr-20 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${active || editing ? 'bg-teal-50' : 'hover:bg-neutral-50'}`}
      >
        <span className="flex min-w-0 items-start gap-2">
          <BookmarkIcon className={`size-4 h-lh shrink-0 ${active ? 'fill-teal-700' : 'fill-neutral-400'}`} />
          <span className="min-w-0">
            <span className="font-medium">{record.recipe.name}</span>
            <span className="text-neutral-600"> — {packageSummary}, WP {record.recipe.wordpress}, PHP {record.recipe.php}</span>
            {missingCount > 0 && <span className="text-amber-700"> — {missingCount} local ZIP{missingCount === 1 ? '' : 's'} missing</span>}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Edit ${record.recipe.name}`}
        onClick={() => onEdit(record)}
        className="absolute top-1/2 right-10 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-teal-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:pointer-events-auto pointer-fine:group-focus-within:opacity-100"
      >
        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
        <PencilSquareIcon className="size-4 shrink-0 fill-current" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${record.recipe.name} from saved recipes`}
        onClick={() => onRemove(record.id)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:pointer-events-auto pointer-fine:group-focus-within:opacity-100"
      >
        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
        <TrashIcon className="size-4 shrink-0 fill-current" />
      </button>
    </div>
  )
}

const compactNumberFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function PackageArtwork({ src = '', label, kind }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-lg bg-neutral-100 object-cover ring-1 ring-neutral-950/8 ${kind === 'theme' ? 'h-16 w-24' : 'size-12'}`}
    />
  ) : (
    <span className={`grid shrink-0 place-items-center rounded-lg bg-neutral-100 font-semibold text-neutral-500 ring-1 ring-neutral-950/8 ${kind === 'theme' ? 'h-16 w-24' : 'size-12'}`} aria-hidden="true">
      {kind === 'theme' ? <FolderOpenIcon className="size-5 fill-neutral-400" /> : label.slice(0, 1).toUpperCase()}
    </span>
  )
}

function RepositoryPluginRow({ plugin, selected, onToggle }) {
  return (
    <div className="flex min-w-0 items-start gap-3 border-t border-neutral-950/8 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <PackageArtwork src={plugin.image} label={plugin.name} kind="plugin" />
      <button
        type="button"
        onClick={() => onToggle(plugin.slug)}
        aria-pressed={selected}
        className={`relative mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:size-4 ${selected ? 'border-teal-700 bg-teal-700 text-white' : 'border-neutral-300 bg-white text-transparent hover:border-teal-700'}`}
      >
        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
        <CheckIcon className="size-3 fill-current" />
        <span className="sr-only">{selected ? 'Remove' : 'Add'} {plugin.name}</span>
      </button>
      <button type="button" onClick={() => onToggle(plugin.slug)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
        <span className="block font-medium text-neutral-950">{plugin.name}</span>
        <span className="block text-neutral-600">
          {plugin.slug}{plugin.version ? ` — ${plugin.version}` : ''}{plugin.activeInstalls ? ` — ${compactNumberFormatter.format(plugin.activeInstalls)} active installs` : ''}
        </span>
        {(plugin.author || plugin.tested) && <span className="block text-neutral-500">{plugin.author}{plugin.author && plugin.tested ? ' — ' : ''}{plugin.tested ? `Tested through WordPress ${plugin.tested}` : ''}</span>}
      </button>
    </div>
  )
}

function RepositoryThemeRow({ theme, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? '' : theme.slug)}
      aria-pressed={selected}
      className={`flex w-full min-w-0 items-start gap-3 border-t border-neutral-950/8 py-4 text-left first:border-t-0 first:pt-0 last:pb-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${selected ? 'text-teal-900' : 'text-neutral-700'}`}
    >
      <PackageArtwork src={theme.image} label={theme.name} kind="theme" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-neutral-950">
          {theme.name}
          {selected && <CheckCircleIcon className="size-4 shrink-0 fill-teal-700" />}
        </span>
        <span className="block text-neutral-600">{theme.slug}{theme.version ? ` — ${theme.version}` : ''}{theme.rating ? ` — ${theme.rating}% rating` : ''}</span>
        {theme.author && <span className="block text-neutral-500">By {theme.author}</span>}
      </span>
    </button>
  )
}

const launchTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function SpinupHistoryRow({ record, active, missingCount, persistenceLabel, onChoose, onRemove }) {
  const pluginDetails = record.plugins.length
    ? record.plugins.map((plugin) => `${plugin.label}${plugin.version ? ` ${plugin.version}` : ''}`).join(', ')
    : 'No premium plugins'
  const themeDetails = record.theme ? `${record.theme.label}${record.theme.version ? ` ${record.theme.version}` : ''}` : 'Default theme'

  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        onClick={() => onChoose(record)}
        className={`w-full rounded-lg p-3 pr-11 text-left text-base/7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm/6 ${active ? 'bg-teal-50 text-neutral-950' : 'text-neutral-700 hover:bg-neutral-50'}`}
      >
        <span className="flex min-w-0 items-start gap-2">
          <ClockIcon className={`size-4 h-lh shrink-0 ${active ? 'fill-teal-700' : 'fill-neutral-400'}`} />
          <span className="grid min-w-0 flex-1 gap-1">
            <span>
              <span className="font-medium">{record.recipe.name}</span>
              <span className="text-neutral-600"> — WP {record.recipe.wordpress}, PHP {record.recipe.php}</span>
            </span>
            <span className="truncate text-neutral-500">{pluginDetails}</span>
            <span className="truncate text-neutral-500">Theme: {themeDetails}</span>
            <span className={record.recipe.storage === 'browser' && persistenceLabel.startsWith('Saved') ? 'text-teal-700' : 'text-neutral-500'}>{persistenceLabel}</span>
            <span className="tabular-nums text-neutral-500">
              <time dateTime={record.launchedAt}>{launchTimeFormatter.format(new Date(record.launchedAt))}</time>
              {missingCount > 0 && <span className="text-amber-700"> — {missingCount} local ZIP{missingCount === 1 ? '' : 's'} missing</span>}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${record.recipe.name} from past spin-ups`}
        onClick={() => onRemove(record.id)}
        className="absolute top-2 right-2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:pointer-events-auto pointer-fine:group-focus-within:opacity-100"
      >
        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
        <TrashIcon className="size-4 shrink-0 fill-current" />
      </button>
    </div>
  )
}

function LicenseManager({ packages, anchorRef, onClose }) {
  const keyRef = useRef(null)
  const closeTimerRef = useRef(null)
  const copyTimerRef = useRef(null)
  const panelRef = useRef(null)
  const [initialized, setInitialized] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [records, setRecords] = useState([])
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [adding, setAdding] = useState(false)
  const [licenseName, setLicenseName] = useState('')
  const [packageId, setPackageId] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [showLicenseKey, setShowLicenseKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [closing, setClosing] = useState(false)
  const [anchorPosition, setAnchorPosition] = useState({ top: 40, right: 8 })

  useLayoutEffect(() => {
    function updateAnchorPosition() {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchorPosition({
        top: Math.round(rect.bottom + 6),
        right: Math.max(8, Math.round(document.documentElement.clientWidth - rect.right)),
      })
    }

    updateAnchorPosition()
    window.addEventListener('resize', updateAnchorPosition)
    return () => window.removeEventListener('resize', updateAnchorPosition)
  }, [anchorRef])

  useEffect(() => {
    let active = true
    getLicenseVaultStatus()
      .then(({ initialized: vaultInitialized }) => {
        if (active) setInitialized(vaultInitialized)
      })
      .catch(() => {
        if (active) setMessage('The encrypted vault could not be opened in this browser.')
      })
    return () => {
      active = false
      keyRef.current = null
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') closeManager()
    }

    function handleOutsidePointer(event) {
      if (panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return
      closeManager()
    }

    window.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.removeEventListener('pointerdown', handleOutsidePointer)
    }
  })

  async function refreshRecords() {
    setRecords(await listLicenseMetadata())
  }

  async function handleCreateVault(event) {
    event.preventDefault()
    setMessage('')
    if (password !== passwordConfirmation) {
      setMessage('The master passwords do not match.')
      return
    }
    setBusy(true)
    try {
      keyRef.current = await createLicenseVault(password)
      setInitialized(true)
      setUnlocked(true)
      setPassword('')
      setPasswordConfirmation('')
      await refreshRecords()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The encrypted vault could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      keyRef.current = await unlockLicenseVault(password)
      setUnlocked(true)
      setPassword('')
      await refreshRecords()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The encrypted vault could not be unlocked.')
    } finally {
      setBusy(false)
    }
  }

  function lockVault() {
    keyRef.current = null
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = null
    setUnlocked(false)
    setRecords([])
    setAdding(false)
    setLicenseKey('')
    setCopiedId('')
    setConfirmingDeleteId('')
    setDeletingId('')
    setMessage('Vault locked.')
  }

  function closeManager() {
    keyRef.current = null
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = null
    setCopiedId('')
    setConfirmingDeleteId('')
    setLicenseKey('')
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, 170)
  }

  function beginAdding() {
    const firstPackage = packages[0]
    setPackageId(firstPackage?.vaultId || '')
    setLicenseName(firstPackage ? pluginLabelFromFilename(firstPackage.filename) : '')
    setLicenseKey('')
    setShowLicenseKey(false)
    setAdding(true)
    setMessage('')
  }

  function chooseLicensePackage(nextPackageId) {
    const packageEntry = packages.find((candidate) => candidate.vaultId === nextPackageId)
    setPackageId(nextPackageId)
    setLicenseName(packageEntry ? pluginLabelFromFilename(packageEntry.filename) : '')
  }

  async function handleAddLicense(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await addLicense(keyRef.current, { name: licenseName, pluginId: packageId, licenseKey })
      setLicenseKey('')
      setShowLicenseKey(false)
      setAdding(false)
      await refreshRecords()
      setMessage('License encrypted and saved locally.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The license could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyLicense(id) {
    setMessage('')
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    try {
      await copyLicenseToClipboard(keyRef.current, id)
      setCopiedId(id)
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId((currentId) => currentId === id ? '' : currentId)
        copyTimerRef.current = null
      }, 1600)
    } catch (caught) {
      setCopiedId('')
      setMessage(caught instanceof Error ? caught.message : 'The license could not be copied.')
    }
  }

  async function handleDeleteLicense(record) {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = null
    setDeletingId(record.id)
    setMessage('')
    try {
      await deleteLicense(record.id)
      await refreshRecords()
      setCopiedId('')
      setConfirmingDeleteId('')
      setMessage(`${record.name} removed from the vault.`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The license could not be deleted.')
    } finally {
      setDeletingId('')
    }
  }

  async function handleResetVault() {
    if (!window.confirm('Reset the encrypted vault? Every saved license will be permanently deleted.')) return
    setBusy(true)
    try {
      await resetLicenseVault()
      keyRef.current = null
      setInitialized(false)
      setUnlocked(false)
      setRecords([])
      setPassword('')
      setMessage('Create a new encrypted vault.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The vault could not be reset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="contents">
      <section
        ref={panelRef}
        role="dialog"
        aria-labelledby="license-manager-title"
        style={{
          '--license-popover-top': `${anchorPosition.top}px`,
          '--license-popover-right': `${anchorPosition.right}px`,
        }}
        className={`license-popover-anchor z-60 grid [max-height:calc(100dvh-var(--license-popover-top)-0.5rem)] w-[min(26rem,calc(100vw-1rem))] grid-rows-[auto_1fr] overflow-hidden rounded-[min(2vw,var(--radius-xl))] bg-white shadow-2xl ring-1 ring-neutral-950/10 ${closing ? 'license-popover-exit' : 'license-popover-enter'}`}
      >
        <div className="flex min-w-0 items-center gap-2 border-b border-white/10 bg-[#1d2327] px-3 py-2 text-white">
          <KeyIcon className="size-4 shrink-0 fill-teal-300" />
          <h2 id="license-manager-title" className="min-w-0 flex-1 truncate text-base/7 font-semibold text-balance text-white sm:text-sm/6">Encrypted license vault</h2>
          {unlocked && (
            <button type="button" onClick={lockVault} className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1.5 pr-2.5 pl-1.5 text-sm/5 font-medium text-white ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white">
              <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
              <LockClosedIcon className="size-4 shrink-0 fill-neutral-300" />
              Lock
            </button>
          )}
          <button type="button" aria-label="Close license manager" onClick={closeManager} className="relative shrink-0 rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white">
            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
            <XMarkIcon className="size-4 shrink-0 fill-current" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {initialized === null ? (
            <p className="text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Opening the encrypted vault.</p>
          ) : !initialized ? (
            <form className="grid gap-5" onSubmit={handleCreateVault}>
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold text-balance">Create a master password</h3>
                <p className="max-w-[58ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">It encrypts every license with AES-GCM and is never stored. There is no password recovery, so keep it in your password manager.</p>
              </div>
              <label htmlFor="new-vault-password" className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
                Master password
                <input id="new-vault-password" name="new-vault-password" type="password" autoComplete="new-password" minLength="12" required value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg bg-white px-3 py-2.5 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6" />
              </label>
              <label htmlFor="confirm-vault-password" className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
                Confirm master password
                <input id="confirm-vault-password" name="confirm-vault-password" type="password" autoComplete="new-password" minLength="12" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className="rounded-lg bg-white px-3 py-2.5 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6" />
              </label>
              {message && <p role="alert" className="text-pretty text-base/7 text-red-700 sm:text-sm/6">{message}</p>}
              <button type="submit" disabled={busy} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-teal-700 py-2.5 pr-4 pl-2.5 text-sm/5 font-medium text-white ring-1 ring-teal-700 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
                <LockOpenIcon className="size-4 shrink-0 fill-white" />
                {busy ? 'Creating…' : 'Create encrypted vault'}
              </button>
            </form>
          ) : !unlocked ? (
            <form className="grid gap-5" onSubmit={handleUnlock}>
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold text-balance">Unlock your licenses</h3>
                <p className="max-w-[58ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">The master password is used only in memory to decrypt a license when you explicitly copy it.</p>
              </div>
              <label htmlFor="vault-password" className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
                Master password
                <input id="vault-password" name="vault-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg bg-white px-3 py-2.5 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6" />
              </label>
              {message && <p role="alert" className="text-pretty text-base/7 text-red-700 sm:text-sm/6">{message}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 py-2.5 pr-4 pl-2.5 text-sm/5 font-medium text-white ring-1 ring-teal-700 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <LockOpenIcon className="size-4 shrink-0 fill-white" />
                  {busy ? 'Unlocking…' : 'Unlock vault'}
                </button>
                <button type="button" disabled={busy} onClick={handleResetVault} className="relative rounded-lg px-3 py-2 text-sm/5 font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50">
                  <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                  Reset vault
                </button>
              </div>
            </form>
          ) : adding ? (
            <form className="grid gap-5" onSubmit={handleAddLicense}>
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold text-balance">Add a license</h3>
                <p className="max-w-[58ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Choose an uploaded plugin or theme, rename the entry if needed, then enter the key. The plaintext field is cleared immediately after encryption.</p>
              </div>
              <Select id="license-package" label="Package" value={packageId} onChange={(event) => chooseLicensePackage(event.target.value)}>
                {packages.map((packageEntry) => <option key={packageEntry.vaultId} value={packageEntry.vaultId}>{pluginLabelFromFilename(packageEntry.filename)} — {packageEntry.kind}</option>)}
              </Select>
              <label htmlFor="license-name" className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
                License name
                <input id="license-name" name="license-name" type="text" required value={licenseName} onChange={(event) => setLicenseName(event.target.value)} className="rounded-lg bg-white px-3 py-2.5 text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6" />
              </label>
              <label htmlFor="license-key" className="grid gap-2 text-base/7 font-medium text-neutral-900 sm:text-sm/6">
                License key
                <span className="relative">
                  <input id="license-key" name="license-key" type={showLicenseKey ? 'text' : 'password'} autoComplete="off" spellCheck="false" required value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} className="w-full rounded-lg bg-white py-2.5 pr-10 pl-3 font-mono text-base/7 font-normal text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6" />
                  <button type="button" aria-label={showLicenseKey ? 'Hide license key' : 'Show license key'} onClick={() => setShowLicenseKey((current) => !current)} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
                    <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                    {showLicenseKey ? <EyeSlashIcon className="size-4 shrink-0 fill-current" /> : <EyeIcon className="size-4 shrink-0 fill-current" />}
                  </button>
                </span>
              </label>
              {message && <p role="alert" className="text-pretty text-base/7 text-red-700 sm:text-sm/6">{message}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={busy || !packages.length} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 py-2.5 pr-4 pl-2.5 text-sm/5 font-medium text-white ring-1 ring-teal-700 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <LockClosedIcon className="size-4 shrink-0 fill-white" />
                  {busy ? 'Encrypting…' : 'Encrypt and save'}
                </button>
                <button type="button" onClick={() => { setAdding(false); setLicenseKey(''); setMessage('') }} className="relative rounded-lg px-3 py-2 text-sm/5 font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
                  <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 max-w-[52ch] flex-1 text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Names are visible after unlocking; keys remain encrypted until you press Copy.</p>
                <button type="button" disabled={!packages.length} onClick={beginAdding} className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                  <PlusIcon className="size-4 shrink-0 fill-neutral-500" />
                  Add license
                </button>
              </div>
              {message && <p aria-live="polite" className="text-pretty text-base/7 text-teal-800 sm:text-sm/6">{message}</p>}
              {records.length ? (
                <ul role="list" className="divide-y divide-neutral-950/8">
                  {records.map((record) => (
                    <li key={record.id} className="group relative min-w-0 py-1">
                      {confirmingDeleteId === record.id ? (
                        <div className="flex min-w-0 items-center gap-2 rounded-lg bg-red-50 py-1.5 pr-1.5 pl-2">
                          <p className="min-w-0 flex-1 truncate text-base/7 font-medium text-neutral-900 sm:text-sm/6">Delete {record.name}?</p>
                          <button type="button" disabled={deletingId === record.id} onClick={() => handleDeleteLicense(record)} className="relative shrink-0 rounded-md px-2 py-1 text-base/7 font-medium text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-wait disabled:opacity-60 sm:text-sm/6">
                            {deletingId === record.id ? 'Deleting…' : 'Delete'}
                          </button>
                          <button type="button" disabled={deletingId === record.id} onClick={() => setConfirmingDeleteId('')} className="relative shrink-0 rounded-md px-2 py-1 text-base/7 font-medium text-neutral-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-60 sm:text-sm/6">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={copiedId === record.id ? `${record.name} license copied` : `Copy ${record.name} license key`}
                            onClick={() => handleCopyLicense(record.id)}
                            className={`w-full min-w-0 rounded-lg py-2 pr-20 pl-2 text-left text-base/7 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm/6 ${copiedId === record.id ? 'text-teal-700' : 'text-neutral-900'}`}
                          >
                            {copiedId === record.id ? (
                              <span className="flex min-w-0 items-center gap-1.5">
                                <CheckIcon className="size-4 shrink-0 fill-teal-700" />
                                <span className="truncate">Copied</span>
                              </span>
                            ) : (
                              <>
                                <span className="block truncate">{record.name}</span>
                                <ClipboardDocumentIcon className="pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 pointer-fine:opacity-0 absolute top-1/2 right-9 size-4 shrink-0 -translate-y-1/2 fill-neutral-500" />
                              </>
                            )}
                          </button>
                          <button type="button" aria-label={`Delete ${record.name}`} onClick={() => { setConfirmingDeleteId(record.id); setMessage('') }} className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
                            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                            <TrashIcon className="size-4 shrink-0 fill-current" />
                          </button>
                        </>
                      )}
                      <span className="sr-only" aria-live="polite">{copiedId === record.id ? `${record.name} copied.` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg bg-neutral-100 p-4">
                  <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">No licenses saved.</p>
                  <p className="text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Add one when you are ready. This launcher never sends the key to a server.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PluginRow({ plugin, selected, onToggle, onReplace, onRemove }) {
  const size = `${(plugin.size / 1024 / 1024).toFixed(1)} MB`
  const versionHint = plugin.versionHint || extractVersionHint(plugin.filename)
  const packageDetails = [versionHint && `version ${versionHint}`, size, 'stored only in this browser'].filter(Boolean).join(', ')
  return (
    <div className="group flex min-w-0 items-start gap-3 border-t border-neutral-950/8 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <PackageArtwork label={plugin.label} kind="plugin" />
      <div className="min-w-0 flex-1 text-base/7 sm:text-sm/6">
        <Checkbox
          id={`plugin-${plugin.id}`}
          checked={selected}
          onChange={() => onToggle(plugin.id)}
          label={plugin.label}
          description={packageDetails}
        />
        <p className="truncate pl-8 font-mono text-base/7 text-neutral-500 sm:pl-7 sm:text-sm/6">{plugin.id}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:pointer-events-auto pointer-fine:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={`Replace ${plugin.label} ZIP with a newer version`}
          onClick={() => onReplace(plugin.id)}
          className="relative shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
          <ArrowPathIcon className="size-4 shrink-0 fill-current" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${plugin.label} from the vault`}
          onClick={() => onRemove(plugin.id)}
          className="relative shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
          <TrashIcon className="size-4 shrink-0 fill-current" />
        </button>
      </div>
    </div>
  )
}

function ThemeRow({ theme, selected, onSelect, onReplace, onRemove }) {
  const size = `${(theme.size / 1024 / 1024).toFixed(1)} MB`
  const versionHint = theme.versionHint || extractVersionHint(theme.filename)
  const packageDetails = [versionHint && `version ${versionHint}`, size, 'stored only in this browser'].filter(Boolean).join(', ')
  return (
    <div className="group flex min-w-0 items-start gap-3 border-t border-neutral-950/8 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <PackageArtwork label={theme.label} kind="theme" />
      <div className="min-w-0 flex-1 text-base/7 sm:text-sm/6">
        <Radio
          id={`theme-${theme.id}`}
          name="premium-theme"
          checked={selected}
          onChange={() => onSelect(theme.id)}
          label={theme.label}
          description={packageDetails}
        />
        <p className="truncate pl-8 font-mono text-base/7 text-neutral-500 sm:pl-7 sm:text-sm/6">{theme.id}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:pointer-events-auto pointer-fine:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={`Replace ${theme.label} theme ZIP with a newer version`}
          onClick={() => onReplace(theme.id)}
          className="relative shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
          <ArrowPathIcon className="size-4 shrink-0 fill-current" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${theme.label} theme from the vault`}
          onClick={() => onRemove(theme.id)}
          className="relative shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
          <TrashIcon className="size-4 shrink-0 fill-current" />
        </button>
      </div>
    </div>
  )
}

function LaunchSummary({ recipe, selectedPackageLabel, status, error, onLaunch }) {
  const stages = [
    ['Preparing WordPress', status.step > 0],
    ['Installing selected packages', status.step > 1],
    ['Ready for license activation', status.step > 2],
  ]

  return (
    <aside className="overflow-hidden rounded-[min(1vw,var(--radius-xl))] bg-linear-to-b from-teal-50/90 via-white to-emerald-50/70 text-neutral-950 shadow-sm ring-1 ring-neutral-950/10 lg:sticky lg:top-6">
      <div className="p-6">
        <h2 className="truncate text-2xl font-semibold tracking-tight text-balance text-neutral-950">{recipe.name}</h2>

        <dl className="grid gap-3 pt-5 text-base/7 sm:text-sm/6">
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-neutral-900">Environment</dt>
            <dd className="text-right text-neutral-600">WordPress {recipe.wordpress}<br />PHP {recipe.php}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-neutral-900">Packages</dt>
            <dd className="text-right text-neutral-600">{selectedPackageLabel || 'WordPress only'}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-neutral-900">Storage</dt>
            <dd className="text-right text-neutral-600">{recipe.storage === 'browser' ? 'Saved in this browser' : 'Temporary'}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="font-medium text-neutral-900">Networking</dt>
            <dd className="text-right text-neutral-600">{recipe.networking ? 'Allowed' : 'Blocked'}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <button
            type="button"
            disabled={status.running}
            onClick={onLaunch}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 py-2.5 pr-4 pl-2.5 text-sm/5 font-semibold text-white ring-1 ring-teal-700 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlayIcon className="size-4 shrink-0 fill-white" />
            Launch {selectedPackageLabel || 'WordPress'}
          </button>
        </div>
      </div>

      {status.running && (
        <ol role="list" className="grid gap-3 bg-white/65 px-6 py-5">
          {stages.map(([label, complete], index) => (
            <li key={label} className="flex items-center gap-2 text-base/7 sm:text-sm/6">
              <CheckCircleIcon className={`size-4 shrink-0 ${complete ? 'fill-teal-700' : 'fill-neutral-300'}`} />
              <span className={complete ? 'text-neutral-950' : 'text-neutral-500'}>{index + 1}. {label}</span>
            </li>
          ))}
          <li className="text-base/7 text-neutral-600 sm:text-sm/6" aria-live="polite">{status.message}</li>
        </ol>
      )}

      {error && <p role="alert" className="mx-6 mb-5 rounded-lg bg-red-50 p-3 text-base/7 text-red-800 ring-1 ring-red-700/15 sm:text-sm/6">{error}</p>}

      <div className="grid gap-3 px-6 pb-6 text-base/7 sm:text-sm/6">
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="size-4 h-lh shrink-0 fill-teal-700" />
          <p className="text-pretty text-neutral-600"><span className="font-medium text-neutral-900">Runs locally.</span> Packages and site data stay in this browser.</p>
        </div>
        <div className="flex items-start gap-2">
          <LockClosedIcon className="size-4 h-lh shrink-0 fill-teal-700" />
          <p className="text-pretty text-neutral-600"><span className="font-medium text-neutral-900">License-safe.</span> Recipes never contain license keys.</p>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircleIcon className="size-4 h-lh shrink-0 fill-teal-700" />
          <p className="text-pretty text-neutral-600"><span className="font-medium text-neutral-900">Official runtime.</span> WordPress starts on the Playground stack.</p>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const iframeRef = useRef(null)
  const launchButtonRef = useRef(null)
  const licenseButtonRef = useRef(null)
  const zipInputRef = useRef(null)
  const replacementZipInputRef = useRef(null)
  const themeZipInputRef = useRef(null)
  const replacementThemeZipInputRef = useRef(null)
  const clientRef = useRef(null)
  const launchIdRef = useRef(0)
  const [plugins, setPlugins] = useState([])
  const [pluginSearch, setPluginSearch] = useState('')
  const [repositoryPluginResults, setRepositoryPluginResults] = useState([])
  const [repositoryPluginSearchState, setRepositoryPluginSearchState] = useState({ loading: false, message: '' })
  const [pluginRecency, setPluginRecency] = useState(() => parsePluginRecency(localStorage.getItem(PLUGIN_RECENCY_KEY)))
  const [themes, setThemes] = useState([])
  const [themeSearch, setThemeSearch] = useState('')
  const [repositoryThemeResults, setRepositoryThemeResults] = useState([])
  const [repositoryThemeSearchState, setRepositoryThemeSearchState] = useState({ loading: false, message: '' })
  const [themeRecency, setThemeRecency] = useState(() => parsePluginRecency(localStorage.getItem(THEME_RECENCY_KEY)))
  const [recipe, setRecipe] = useState(() => {
    let initialRecipe
    try {
      initialRecipe = validateRecipe(JSON.parse(localStorage.getItem(DRAFT_KEY)))
    } catch {
      initialRecipe = DEFAULT_RECIPE
    }
    const migratedRecipe = migrateStorageDefault(initialRecipe, localStorage.getItem(STORAGE_DEFAULT_MIGRATION_KEY) === '1')
    localStorage.setItem(STORAGE_DEFAULT_MIGRATION_KEY, '1')
    return migratedRecipe
  })
  const [savedRecipes, setSavedRecipes] = useState(() => {
    return parseSavedRecipes(localStorage.getItem(SAVED_RECIPES_KEY))
  })
  const [spinupHistory, setSpinupHistory] = useState(() => parseSpinupHistory(localStorage.getItem(SPINUP_HISTORY_KEY)))
  const [selectionMode, setSelectionMode] = useState(() => savedRecipes.length ? 'recipes' : 'plugins')
  const [activeSavedId, setActiveSavedId] = useState(() => (
    savedRecipes.find((record) => JSON.stringify(record.recipe) === JSON.stringify(recipe))?.id || ''
  ))
  const [editingSavedId, setEditingSavedId] = useState('')
  const [activeSpinupId, setActiveSpinupId] = useState('')
  const [replacementPluginId, setReplacementPluginId] = useState('')
  const [replacementThemeId, setReplacementThemeId] = useState('')
  const [status, setStatus] = useState({ running: false, step: 0, message: '' })
  const [updateCheck, setUpdateCheck] = useState({ checking: false, message: '' })
  const [showLicenseManager, setShowLicenseManager] = useState(false)
  const [showPlayground, setShowPlayground] = useState(false)
  const [confirmingPlaygroundClose, setConfirmingPlaygroundClose] = useState(false)
  const [snapshotExporting, setSnapshotExporting] = useState(false)
  const [error, setError] = useState('')
  const [wordpressVersionOptions, setWordPressVersionOptions] = useState(WORDPRESS_VERSION_FALLBACK_OPTIONS)

  const selectedCount = recipe.plugins.length + recipe.repositoryPlugins.length
  const selectedPackageCount = selectedCount + (recipe.theme || recipe.repositoryTheme ? 1 : 0)
  const selectedPackageLabel = [
    selectedCount ? `${selectedCount} plugin${selectedCount === 1 ? '' : 's'}` : '',
    recipe.theme || recipe.repositoryTheme ? '1 theme' : '',
  ].filter(Boolean).join(' + ')
  const missingPluginIds = useMemo(
    () => recipe.plugins.filter((id) => !plugins.some((plugin) => plugin.id === id)),
    [plugins, recipe.plugins],
  )
  const visiblePlugins = useMemo(
    () => sortAndFilterPlugins(plugins, pluginRecency, pluginSearch),
    [plugins, pluginRecency, pluginSearch],
  )
  const missingThemeId = recipe.theme && !themes.some((theme) => theme.id === recipe.theme) ? recipe.theme : ''
  const visibleThemes = useMemo(
    () => sortAndFilterPlugins(themes, themeRecency, themeSearch),
    [themes, themeRecency, themeSearch],
  )
  const licensePackages = useMemo(() => [
    ...plugins.map((plugin) => ({ ...plugin, vaultId: `plugin:${plugin.id}`, kind: 'Plugin' })),
    ...themes.map((theme) => ({ ...theme, vaultId: `theme:${theme.id}`, kind: 'Theme' })),
  ], [plugins, themes])
  const visibleWordPressVersionOptions = useMemo(
    () => preserveSelectedWordPressVersion(wordpressVersionOptions, recipe.wordpress),
    [wordpressVersionOptions, recipe.wordpress],
  )
  const visibleRepositoryPlugins = useMemo(() => {
    const bySlug = new Map(repositoryPluginResults.map((plugin) => [plugin.slug, plugin]))
    for (const slug of recipe.repositoryPlugins) {
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, name: slug, version: '', author: '', activeInstalls: 0, tested: '', image: '' })
    }
    return [...bySlug.values()]
  }, [repositoryPluginResults, recipe.repositoryPlugins])
  const visibleRepositoryThemes = useMemo(() => {
    const bySlug = new Map(repositoryThemeResults.map((theme) => [theme.slug, theme]))
    if (recipe.repositoryTheme && !bySlug.has(recipe.repositoryTheme)) {
      bySlug.set(recipe.repositoryTheme, { slug: recipe.repositoryTheme, name: recipe.repositoryTheme, version: '', author: '', rating: 0, image: '' })
    }
    return [...bySlug.values()]
  }, [repositoryThemeResults, recipe.repositoryTheme])

  useEffect(() => {
    listPlugins().then(setPlugins).catch((caught) => setError(caught.message))
    listThemes().then(setThemes).catch((caught) => setError(caught.message))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchWordPressVersionOptions({ signal: controller.signal })
      .then(setWordPressVersionOptions)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const query = pluginSearch.trim()
    if (query.length < 2) {
      setRepositoryPluginResults([])
      setRepositoryPluginSearchState({ loading: false, message: '' })
      return undefined
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setRepositoryPluginSearchState({ loading: true, message: '' })
      searchWordPressOrgPlugins(query, { signal: controller.signal })
        .then((results) => {
          setRepositoryPluginResults(results)
          setRepositoryPluginSearchState({ loading: false, message: results.length ? '' : 'No WordPress.org plugins matched your search.' })
        })
        .catch((caught) => {
          if (caught.name !== 'AbortError') setRepositoryPluginSearchState({ loading: false, message: 'WordPress.org search is temporarily unavailable.' })
        })
    }, 350)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [pluginSearch])

  useEffect(() => {
    const query = themeSearch.trim()
    if (query.length < 2) {
      setRepositoryThemeResults([])
      setRepositoryThemeSearchState({ loading: false, message: '' })
      return undefined
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setRepositoryThemeSearchState({ loading: true, message: '' })
      searchWordPressOrgThemes(query, { signal: controller.signal })
        .then((results) => {
          setRepositoryThemeResults(results)
          setRepositoryThemeSearchState({ loading: false, message: results.length ? '' : 'No WordPress.org themes matched your search.' })
        })
        .catch((caught) => {
          if (caught.name !== 'AbortError') setRepositoryThemeSearchState({ loading: false, message: 'WordPress.org theme search is temporarily unavailable.' })
        })
    }, 350)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [themeSearch])

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(recipe))
  }, [recipe])

  useEffect(() => {
    localStorage.setItem(SAVED_RECIPES_KEY, serializeSavedRecipes(savedRecipes))
  }, [savedRecipes])

  useEffect(() => {
    localStorage.setItem(SPINUP_HISTORY_KEY, serializeSpinupHistory(spinupHistory))
  }, [spinupHistory])

  useEffect(() => {
    localStorage.setItem(PLUGIN_RECENCY_KEY, JSON.stringify(pluginRecency))
  }, [pluginRecency])

  useEffect(() => {
    localStorage.setItem(THEME_RECENCY_KEY, JSON.stringify(themeRecency))
  }, [themeRecency])

  useEffect(() => {
    if (!shouldWarnBeforeUnload({ playgroundOpen: showPlayground, running: status.running, storage: recipe.storage })) return undefined

    function warnBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [recipe.storage, showPlayground, status.running])

  function updateRecipe(patch) {
    setActiveSavedId('')
    setActiveSpinupId('')
    setRecipe((current) => ({ ...current, ...patch }))
  }

  function saveRecipeToLibrary(candidate, replaceId = '') {
    const safeRecipe = validateRecipe(candidate)
    const id = normalizePluginId(safeRecipe.name) || 'recipe'
    setSavedRecipes((current) => replaceId
      ? replaceSavedRecipe(current, replaceId, safeRecipe)
      : upsertSavedRecipe(current, safeRecipe))
    setActiveSavedId(id)
    setEditingSavedId('')
    setSelectionMode('recipes')
  }

  function handleSaveRecipe() {
    try {
      setError('')
      saveRecipeToLibrary(recipe, editingSavedId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review the recipe settings before saving.')
    }
  }

  function handleRecipeExport() {
    try {
      setError('')
      downloadRecipe(recipe)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review the recipe settings before exporting.')
    }
  }

  async function handleZipImport(event) {
    setError('')
    try {
      setActiveSavedId('')
      for (const file of event.target.files) {
        await assertZipFile(file)
        const id = normalizePluginId(file.name)
        if (!id) throw new Error(`Could not create an ID for ${file.name}.`)
        const existing = await getPlugin(id)
        await savePlugin({
          id,
          label: existing?.label || pluginLabelFromFilename(file.name),
          filename: file.name,
          size: file.size,
          file,
          versionHint: extractVersionHint(file.name),
          savedAt: Date.now(),
        })
        setPluginRecency((current) => markPluginSelected(current, id))
        setRecipe((current) => validateRecipe({ ...current, plugins: [...current.plugins, id] }))
      }
      setPlugins(await listPlugins())
    } catch (caught) {
      setError(caught.message)
    } finally {
      event.target.value = ''
    }
  }

  async function handleReplacementZip(event) {
    setError('')
    const file = event.target.files[0]
    try {
      if (!file || !replacementPluginId) return
      await assertZipFile(file)
      const existing = await getPlugin(replacementPluginId)
      if (!existing) throw new Error('The plugin to replace is no longer in the local vault.')
      await savePlugin({
        ...existing,
        label: pluginLabelFromFilename(file.name),
        filename: file.name,
        size: file.size,
        file,
        versionHint: extractVersionHint(file.name),
        savedAt: Date.now(),
      })
      setPlugins(await listPlugins())
    } catch (caught) {
      setError(caught.message)
    } finally {
      event.target.value = ''
      setReplacementPluginId('')
    }
  }

  async function handleThemeZipImport(event) {
    setError('')
    try {
      setActiveSavedId('')
      for (const file of event.target.files) {
        await assertZipFile(file)
        const id = normalizePluginId(file.name)
        if (!id) throw new Error(`Could not create a theme ID for ${file.name}.`)
        const existing = await getTheme(id)
        await saveTheme({
          id,
          label: existing?.label || pluginLabelFromFilename(file.name),
          filename: file.name,
          size: file.size,
          file,
          versionHint: extractVersionHint(file.name),
          savedAt: Date.now(),
        })
        setThemeRecency((current) => markPluginSelected(current, id))
        setRecipe((current) => validateRecipe({ ...current, theme: id }))
      }
      setThemes(await listThemes())
    } catch (caught) {
      setError(caught.message)
    } finally {
      event.target.value = ''
    }
  }

  async function handleReplacementThemeZip(event) {
    setError('')
    const file = event.target.files[0]
    try {
      if (!file || !replacementThemeId) return
      await assertZipFile(file)
      const existing = await getTheme(replacementThemeId)
      if (!existing) throw new Error('The theme to replace is no longer in the local vault.')
      await saveTheme({
        ...existing,
        label: pluginLabelFromFilename(file.name),
        filename: file.name,
        size: file.size,
        file,
        versionHint: extractVersionHint(file.name),
        savedAt: Date.now(),
      })
      setThemes(await listThemes())
    } catch (caught) {
      setError(caught.message)
    } finally {
      event.target.value = ''
      setReplacementThemeId('')
    }
  }

  async function handleRecipeImport(event) {
    setError('')
    try {
      const imported = validateRecipe(JSON.parse(await event.target.files[0].text()))
      setRecipe(imported)
      saveRecipeToLibrary(imported)
    } catch (caught) {
      setError(caught.message)
    } finally {
      event.target.value = ''
    }
  }

  function chooseSavedRecipe(record) {
    setRecipe(validateRecipe(record.recipe))
    setActiveSavedId(record.id)
    setEditingSavedId('')
    setActiveSpinupId('')
  }

  function editSavedRecipe(record) {
    setRecipe(validateRecipe(record.recipe))
    setActiveSavedId(record.id)
    setEditingSavedId(record.id)
    setActiveSpinupId('')
  }

  function chooseSpinup(record) {
    setRecipe(validateRecipe(record.recipe))
    setActiveSavedId('')
    setEditingSavedId('')
    setActiveSpinupId(record.id)
  }

  function removeSavedRecipe(id) {
    setSavedRecipes((current) => current.filter((record) => record.id !== id))
    if (activeSavedId === id) setActiveSavedId('')
    if (editingSavedId === id) setEditingSavedId('')
  }

  function removeSpinup(id) {
    setSpinupHistory((current) => current.filter((record) => record.id !== id))
    if (activeSpinupId === id) setActiveSpinupId('')
  }

  function replacePluginZip(id) {
    setReplacementPluginId(id)
    replacementZipInputRef.current?.click()
  }

  function replaceThemeZip(id) {
    setReplacementThemeId(id)
    replacementThemeZipInputRef.current?.click()
  }

  function togglePlugin(id) {
    if (!recipe.plugins.includes(id)) {
      setPluginRecency((current) => markPluginSelected(current, id))
    }
    updateRecipe({
      plugins: recipe.plugins.includes(id) ? recipe.plugins.filter((pluginId) => pluginId !== id) : [...recipe.plugins, id],
    })
  }

  function toggleRepositoryPlugin(slug) {
    updateRecipe({
      repositoryPlugins: recipe.repositoryPlugins.includes(slug)
        ? recipe.repositoryPlugins.filter((pluginSlug) => pluginSlug !== slug)
        : [...recipe.repositoryPlugins, slug],
    })
  }

  function chooseTheme(id) {
    if (id) setThemeRecency((current) => markPluginSelected(current, id))
    updateRecipe({ theme: id, repositoryTheme: '' })
  }

  function chooseRepositoryTheme(slug) {
    updateRecipe({ repositoryTheme: slug, theme: '' })
  }

  async function handleRemovePlugin(id) {
    await removePlugin(id)
    setPluginRecency((current) => forgetPluginRecency(current, id))
    updateRecipe({ plugins: recipe.plugins.filter((pluginId) => pluginId !== id) })
    setPlugins(await listPlugins())
  }

  async function handleRemoveTheme(id) {
    await removeTheme(id)
    setThemeRecency((current) => forgetPluginRecency(current, id))
    if (recipe.theme === id) updateRecipe({ theme: '' })
    setThemes(await listThemes())
  }

  function closePlayground() {
    launchIdRef.current += 1
    setConfirmingPlaygroundClose(false)
    setShowLicenseManager(false)
    setShowPlayground(false)
    clientRef.current = null
    if (iframeRef.current) iframeRef.current.src = 'about:blank'
    setStatus({ running: false, step: 0, message: '' })
    setUpdateCheck({ checking: false, message: '' })
    window.requestAnimationFrame(() => launchButtonRef.current?.focus())
  }

  function requestPlaygroundClose() {
    if (recipe.storage === 'temporary' && status.step > 0) {
      setShowLicenseManager(false)
      setConfirmingPlaygroundClose(true)
      return
    }
    closePlayground()
  }

  async function launch() {
    if (missingPluginIds.length) {
      setError(`Import the missing ZIP${missingPluginIds.length === 1 ? '' : 's'} first: ${missingPluginIds.join(', ')}`)
      return
    }
    if (missingThemeId) {
      setError(`Import the missing theme ZIP first: ${missingThemeId}`)
      return
    }

    let launchedRecipe
    try {
      launchedRecipe = validateRecipe(recipe)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review the environment settings before launching.')
      return
    }
    const launchId = launchIdRef.current + 1
    launchIdRef.current = launchId
    setError('')
    setConfirmingPlaygroundClose(false)
    setShowPlayground(true)
    setStatus({ running: true, step: 0, message: launchedRecipe.wordpress === 'latest' ? 'Confirming the latest stable WordPress release…' : 'Starting the local WordPress runtime…' })

    let expectedLatestWordPressVersion = ''
    if (launchedRecipe.wordpress === 'latest') {
      try {
        const launchVersionOptions = await fetchWordPressVersionOptions()
        if (launchId !== launchIdRef.current) return
        expectedLatestWordPressVersion = getLatestStableWordPressVersion(launchVersionOptions)
        if (!expectedLatestWordPressVersion) throw new Error('WordPress did not return a latest stable release.')
        setWordPressVersionOptions(launchVersionOptions)
      } catch (caught) {
        if (launchId !== launchIdRef.current) return
        setShowPlayground(false)
        setStatus({ running: false, step: 0, message: '' })
        setError(caught instanceof Error ? `The latest WordPress release could not be confirmed: ${caught.message}` : 'The latest WordPress release could not be confirmed.')
        return
      }
    }

    const runtimeRecipe = expectedLatestWordPressVersion
      ? { ...launchedRecipe, wordpress: expectedLatestWordPressVersion }
      : launchedRecipe
    const siteId = persistedSiteId(runtimeRecipe)
    const usesBrowserStorage = launchedRecipe.storage === 'browser'
    const hasPersistedSite = usesBrowserStorage && readPersistedSites().has(siteId)
    const mountDescriptor = {
      device: { type: 'opfs', path: `private-playground-launcher/sites/${siteId}` },
      mountpoint: '/wordpress',
      initialSyncDirection: hasPersistedSite ? 'opfs-to-memfs' : 'memfs-to-opfs',
    }
    setStatus({ running: true, step: 0, message: 'Starting the local WordPress runtime…' })

    try {
      if (usesBrowserStorage && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false)
      }
      const client = await startPlaygroundWeb({
        iframe: iframeRef.current,
        remoteUrl: 'https://playground.wordpress.net/remote.html',
        scope: `launcher-${siteId}`,
        blueprint: buildPlaygroundBlueprint(runtimeRecipe, { includeOneTimeSetup: !hasPersistedSite }),
        ...(launchedRecipe.phpExtensionManifestUrl ? {
          extensions: [{ source: { format: 'manifest', manifestUrl: launchedRecipe.phpExtensionManifestUrl } }],
        } : {}),
        ...(hasPersistedSite ? { mounts: [mountDescriptor], shouldInstallWordPress: false } : {}),
      })
      await client.isReady()
      if (launchId !== launchIdRef.current) return
      const wordpressVersionResponse = await client.run({
        code: `<?php
require '/wordpress/wp-load.php';
global $wp_version;
echo 'PLAYGROUND_WORDPRESS_VERSION:' . $wp_version;
`,
      })
      if (launchId !== launchIdRef.current) return
      const wordpressVersionMarker = 'PLAYGROUND_WORDPRESS_VERSION:'
      const wordpressVersionMarkerIndex = wordpressVersionResponse.text.lastIndexOf(wordpressVersionMarker)
      const launchedWordPressVersion = wordpressVersionMarkerIndex >= 0
        ? wordpressVersionResponse.text.slice(wordpressVersionMarkerIndex + wordpressVersionMarker.length).split(/\r?\n/, 1)[0].trim()
        : ''
      if (!launchedWordPressVersion) throw new Error('The launched WordPress version could not be verified.')
      if (expectedLatestWordPressVersion && launchedWordPressVersion !== expectedLatestWordPressVersion) {
        throw new Error(`Playground started WordPress ${launchedWordPressVersion}, but the latest stable release is ${expectedLatestWordPressVersion}.`)
      }
      if (usesBrowserStorage && !hasPersistedSite) {
        await client.mountOpfs(mountDescriptor)
        if (launchId !== launchIdRef.current) return
        rememberPersistedSite(siteId)
      }
      clientRef.current = client
      setStatus({ running: true, step: 1, message: `WordPress ${launchedWordPressVersion} is ready.` })

      const installedPlugins = launchedRecipe.repositoryPlugins.map((slug) => {
        const metadata = repositoryPluginResults.find((plugin) => plugin.slug === slug)
        return {
          id: slug,
          label: metadata?.name || slug,
          version: metadata?.version || '',
        }
      })
      for (const [index, id] of launchedRecipe.plugins.entries()) {
        const plugin = await getPlugin(id)
        installedPlugins.push(plugin)
        const pluginFile = new File([plugin.file], plugin.filename, { type: 'application/zip' })
        setStatus({ running: true, step: 1, message: `Installing ${plugin.label} (${index + 1} of ${launchedRecipe.plugins.length})…` })
        await installPlugin(client, {
          pluginData: pluginFile,
          options: { activate: true },
          ifAlreadyInstalled: 'overwrite',
        })
        if (launchId !== launchIdRef.current) return
      }

      let installedTheme = launchedRecipe.repositoryTheme ? (() => {
        const metadata = repositoryThemeResults.find((theme) => theme.slug === launchedRecipe.repositoryTheme)
        return { id: launchedRecipe.repositoryTheme, label: metadata?.name || launchedRecipe.repositoryTheme, version: metadata?.version || '' }
      })() : null
      if (launchedRecipe.theme) {
        installedTheme = await getTheme(launchedRecipe.theme)
        const themeFile = new File([installedTheme.file], installedTheme.filename, { type: 'application/zip' })
        setStatus({ running: true, step: 2, message: `Installing and activating ${installedTheme.label}…` })
        await installTheme(client, {
          themeData: themeFile,
          options: { activate: true, targetFolderName: launchedRecipe.theme },
          ifAlreadyInstalled: 'overwrite',
        })
        if (launchId !== launchIdRef.current) return
        const activeThemeResponse = await client.run({
          code: `<?php
require '/wordpress/wp-load.php';
echo 'PLAYGROUND_ACTIVE_THEME:' . get_option('stylesheet');
`,
        })
        if (launchId !== launchIdRef.current) return
        const activeThemeMarker = 'PLAYGROUND_ACTIVE_THEME:'
        const activeThemeMarkerIndex = activeThemeResponse.text.lastIndexOf(activeThemeMarker)
        const activeThemeId = activeThemeMarkerIndex >= 0
          ? activeThemeResponse.text.slice(activeThemeMarkerIndex + activeThemeMarker.length).trim()
          : ''
        if (activeThemeId !== launchedRecipe.theme) throw new Error(`${installedTheme.label} was installed but could not be activated.`)
      } else {
        setStatus({ running: true, step: 2, message: 'Selected packages are installed.' })
      }

      setStatus({ running: true, step: 3, message: `Ready on WordPress ${launchedWordPressVersion}. Activate licenses inside WordPress when needed.` })
      await client.goTo(launchedRecipe.landingPage)
      if (launchId !== launchIdRef.current) return
      const historyRecipe = launchedRecipe.wordpress === 'latest'
        ? { ...launchedRecipe, wordpress: launchedWordPressVersion }
        : launchedRecipe
      setSpinupHistory((current) => appendSpinup(current, { recipe: historyRecipe, plugins: installedPlugins, theme: installedTheme }))
    } catch (caught) {
      if (launchId !== launchIdRef.current) return
      clientRef.current = null
      if (iframeRef.current) iframeRef.current.src = 'about:blank'
      setShowPlayground(false)
      setError(caught instanceof Error ? caught.message : 'Playground failed to start.')
      setStatus((current) => ({ ...current, running: false }))
    }
  }

  async function exportSiteSnapshot() {
    if (!clientRef.current) return
    setSnapshotExporting(true)
    setUpdateCheck({ checking: false, message: 'Preparing a browser-local site snapshot.' })
    try {
      const archive = await zipWpContent(clientRef.current)
      const blob = new Blob([archive], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${normalizePluginId(recipe.name) || 'playground'}-wp-content.zip`
      anchor.click()
      URL.revokeObjectURL(url)
      setUpdateCheck({ checking: false, message: 'The wp-content snapshot was downloaded.' })
    } catch (caught) {
      setUpdateCheck({ checking: false, message: caught instanceof Error ? caught.message : 'The site snapshot could not be exported.' })
    } finally {
      setSnapshotExporting(false)
    }
  }

  async function updateAllPackages() {
    if (!clientRef.current) return
    setUpdateCheck({ checking: true, message: 'Checking for and installing every available plugin and theme update.' })
    try {
      const response = await clientRef.current.run({
        code: `<?php
define('WP_ADMIN', true);
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-admin/includes/theme.php';
require_once ABSPATH . 'wp-admin/includes/update.php';
require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
require_once ABSPATH . 'wp-admin/includes/class-plugin-upgrader.php';
require_once ABSPATH . 'wp-admin/includes/class-theme-upgrader.php';
require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader-skin.php';
require_once ABSPATH . 'wp-admin/includes/class-automatic-upgrader-skin.php';

delete_site_transient('update_plugins');
wp_update_plugins();
$state = get_site_transient('update_plugins');
$result = array('available' => 0, 'updated' => array(), 'failed' => array());

if (is_object($state) && !empty($state->response) && is_array($state->response)) {
    $installed = get_plugins();
    $result['available'] = count($state->response);

    foreach (array_keys($state->response) as $plugin_file) {
        $plugin_name = $installed[$plugin_file]['Name'] ?? $plugin_file;
        $skin = new Automatic_Upgrader_Skin();
        $upgrader = new Plugin_Upgrader($skin);
        $upgrade_result = $upgrader->upgrade($plugin_file, array('clear_update_cache' => false));

        if (is_wp_error($upgrade_result)) {
            $result['failed'][] = array('item' => $plugin_name, 'message' => $upgrade_result->get_error_message());
        } elseif ($upgrade_result === false || $upgrade_result === null) {
            $messages = $skin->get_upgrade_messages();
            $result['failed'][] = array('item' => $plugin_name, 'message' => $messages ? wp_strip_all_tags(end($messages)) : 'Update failed.');
        } else {
            $result['updated'][] = $plugin_name;
        }
    }

    wp_clean_plugins_cache(true);
}

delete_site_transient('update_themes');
wp_update_themes();
$theme_state = get_site_transient('update_themes');

if (is_object($theme_state) && !empty($theme_state->response) && is_array($theme_state->response)) {
    $installed_themes = wp_get_themes();
    $result['available'] += count($theme_state->response);

    foreach (array_keys($theme_state->response) as $theme_slug) {
        $theme_name = isset($installed_themes[$theme_slug]) ? $installed_themes[$theme_slug]->get('Name') : $theme_slug;
        $skin = new Automatic_Upgrader_Skin();
        $upgrader = new Theme_Upgrader($skin);
        $upgrade_result = $upgrader->upgrade($theme_slug, array('clear_update_cache' => false));

        if (is_wp_error($upgrade_result)) {
            $result['failed'][] = array('item' => $theme_name, 'message' => $upgrade_result->get_error_message());
        } elseif ($upgrade_result === false || $upgrade_result === null) {
            $messages = $skin->get_upgrade_messages();
            $result['failed'][] = array('item' => $theme_name, 'message' => $messages ? wp_strip_all_tags(end($messages)) : 'Update failed.');
        } else {
            $result['updated'][] = $theme_name;
        }
    }

    wp_clean_themes_cache(true);
}

echo 'PLAYGROUND_UPDATES:' . wp_json_encode($result);
`,
      })
      const marker = 'PLAYGROUND_UPDATES:'
      const markerIndex = response.text.lastIndexOf(marker)
      if (markerIndex < 0) throw new Error('WordPress did not return an update result.')
      const result = JSON.parse(response.text.slice(markerIndex + marker.length).trim())
      if (result.failed.length) {
        setUpdateCheck({
          checking: false,
          message: `${result.updated.length} updated. ${result.failed.length} failed: ${result.failed.map((failure) => failure.item).join(', ')}.`,
        })
      } else if (result.updated.length) {
        setUpdateCheck({ checking: false, message: `${result.updated.length} package${result.updated.length === 1 ? '' : 's'} updated successfully.` })
      } else {
        setUpdateCheck({ checking: false, message: 'Every plugin and theme is already current, or its license has not enabled updates yet.' })
      }
      await clientRef.current.goTo('/wp-admin/plugins.php')
    } catch (caught) {
      setUpdateCheck({ checking: false, message: caught instanceof Error ? caught.message : 'The package updates failed.' })
    }
  }

  return (
    <div className="isolate min-h-dvh bg-[#f7f8f6] text-neutral-950">
      <AppHeader onImportRecipe={handleRecipeImport} />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[13fr_7fr] lg:items-start">
          <div className="min-w-0">
            <div>
              <p className="font-mono text-base/7 tracking-wide text-teal-700 sm:text-sm/6">PRIVATE, IN-BROWSER PLAYGROUND</p>
              <h1 className="max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Test premium WordPress tools with ease</h1>
              <p className="max-w-[48ch] text-pretty text-lg text-neutral-600">
                Test your premium plugins and themes on the official WordPress Playground stack. Everything runs privately in your browser, with your packages and licenses kept under your control.
              </p>
            </div>

            <form className="grid gap-8 pt-10" onSubmit={(event) => { event.preventDefault(); launch() }}>
              <section aria-labelledby="environment-heading" className="border-t border-neutral-950/10 pt-6">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id="environment-heading" className="text-xl font-semibold text-balance">1. Environment</h2>
                  <p className="font-mono text-base/7 text-neutral-500 sm:text-sm/6">EPHEMERAL + SQLITE</p>
                </div>
                <div className="@container pt-5">
                  <div className="grid gap-4 @md:grid-cols-2">
                    <Select
                      id="wordpress-version"
                      label="WordPress"
                      value={recipe.wordpress}
                      onChange={(event) => updateRecipe({ wordpress: event.target.value })}
                    >
                      <optgroup label="Stable releases">
                        {visibleWordPressVersionOptions.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Development builds">
                        <option value="beta">Beta / release candidate</option>
                        <option value="nightly">Nightly</option>
                      </optgroup>
                    </Select>
                    <Select id="php-version" label="PHP" value={recipe.php} onChange={(event) => updateRecipe({ php: event.target.value })}>
                      {['8.5', '8.4', '8.3', '8.2', '8.1', '8.0', '7.4'].map((version) => <option key={version} value={version}>{version}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="pt-5 text-base/7 sm:text-sm/6">
                  <Checkbox
                    id="networking"
                    checked={recipe.networking}
                    onChange={(event) => updateRecipe({ networking: event.target.checked })}
                    label="Allow outbound networking"
                    description="Usually required when a plugin or theme contacts its license server."
                  />
                </div>
                <details className="group mt-5 rounded-xl bg-white ring-1 ring-neutral-950/10 open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-base/7 font-medium text-neutral-900 outline-none marker:hidden hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm/6 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">Advanced settings</span>
                    <span className="font-normal text-neutral-500">Site, storage, debugging, and imports</span>
                    <ChevronDownIcon className="size-4 shrink-0 fill-neutral-500 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-6 border-t border-neutral-950/10 p-4">
                    <fieldset className="grid gap-4">
                      <legend className="text-base/7 font-semibold text-neutral-950 sm:text-sm/6">Site setup</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Select id="site-language" label="Language" value={recipe.language} onChange={(event) => updateRecipe({ language: event.target.value })}>
                          <option value="en_US">English (United States)</option>
                          <option value="nl_NL">Nederlands</option>
                          <option value="de_DE">Deutsch</option>
                          <option value="fr_FR">Français</option>
                          <option value="es_ES">Español</option>
                          <option value="it_IT">Italiano</option>
                        </Select>
                        <Select id="landing-page" label="Open after launch" value={recipe.landingPage} onChange={(event) => updateRecipe({ landingPage: event.target.value })}>
                          <option value="/wp-admin/">Dashboard</option>
                          <option value="/wp-admin/plugins.php">Plugins</option>
                          <option value="/wp-admin/themes.php">Themes</option>
                          <option value="/wp-admin/site-editor.php">Site Editor</option>
                          <option value="/">Site front page</option>
                        </Select>
                        <TextField id="site-title" label="Site title" value={recipe.siteTitle} onChange={(event) => updateRecipe({ siteTitle: event.target.value })} />
                        <TextField id="site-tagline" label="Tagline" value={recipe.tagline} onChange={(event) => updateRecipe({ tagline: event.target.value })} placeholder="Optional" />
                        <Select id="permalink-structure" label="Permalinks" value={recipe.permalinkStructure} onChange={(event) => updateRecipe({ permalinkStructure: event.target.value })}>
                          <option value="/%postname%/">Post name</option>
                          <option value="/%year%/%monthnum%/%postname%/">Month and name</option>
                          <option value="">Plain</option>
                        </Select>
                        <Select id="storage-mode" label="Storage" value={recipe.storage} onChange={(event) => updateRecipe({ storage: event.target.value })}>
                          <option value="browser">Saved in browser — resumes after refresh</option>
                          <option value="temporary">Temporary — lost when closed or refreshed</option>
                        </Select>
                      </div>
                    </fieldset>

                    <fieldset className="grid gap-3 border-t border-neutral-950/10 pt-5 text-base/7 sm:text-sm/6">
                      <legend className="mb-1 text-base/7 font-semibold text-neutral-950 sm:text-sm/6">Runtime features</legend>
                      <Checkbox id="multisite" checked={recipe.multisite} onChange={(event) => updateRecipe({ multisite: event.target.checked })} label="Enable Multisite" description="Configured when a new site is created." />
                      <Checkbox id="intl" checked={recipe.intl} onChange={(event) => updateRecipe({ intl: event.target.checked })} label="Enable PHP Intl" description="Adds locale-aware PHP formatting support." />
                      <Checkbox id="wp-cli" checked={recipe.wpCli} onChange={(event) => updateRecipe({ wpCli: event.target.checked })} label="Load WP-CLI" description="Makes WP-CLI available to Playground automation." />
                      <Checkbox id="wp-debug" checked={recipe.debug} onChange={(event) => updateRecipe({ debug: event.target.checked })} label="WordPress debug mode" description="Displays PHP and WordPress development errors." />
                      <div className="grid gap-3 pl-7">
                        <Checkbox id="wp-debug-log" checked={recipe.debugLog} onChange={(event) => updateRecipe({ debugLog: event.target.checked })} label="Write debug.log" description="Only active while debug mode is enabled." />
                        <Checkbox id="script-debug" checked={recipe.scriptDebug} onChange={(event) => updateRecipe({ scriptDebug: event.target.checked })} label="Use development scripts" description="Loads unminified WordPress CSS and JavaScript where available." />
                      </div>
                    </fieldset>

                    <fieldset className="grid gap-4 border-t border-amber-900/15 bg-amber-50/60 p-4">
                      <legend className="px-1 text-base/7 font-semibold text-amber-950 sm:text-sm/6">External setup</legend>
                      <p className="max-w-[70ch] text-pretty text-base/7 text-amber-900 sm:text-sm/6">These URLs download and execute content inside Playground. Use only sources you trust; they are stored in the recipe, but license keys never belong here.</p>
                      <TextField id="wxr-url" type="url" label="WXR content URL" value={recipe.wxrUrl} onChange={(event) => updateRecipe({ wxrUrl: event.target.value })} placeholder="https://example.com/content.xml" description="Imported once when a new site is created. Requires networking." />
                      <TextField id="php-extension-manifest" type="url" label="PHP extension manifest" value={recipe.phpExtensionManifestUrl} onChange={(event) => updateRecipe({ phpExtensionManifestUrl: event.target.value })} placeholder="https://example.com/manifest.json" description="Advanced PHP-Wasm extension loaded before WordPress starts." />
                    </fieldset>
                  </div>
                </details>
              </section>

              <section aria-labelledby="plugins-heading" className="border-t border-neutral-950/10 pt-6">
                <div>
                  <h2 id="plugins-heading" className="text-xl font-semibold text-balance">2. Choose a setup</h2>
                  <p className="max-w-[56ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Start with a saved recipe, restore a past spin-up, or search uploaded and WordPress.org packages together.</p>
                </div>

                <div role="tablist" aria-label="Setup source" className="flex max-w-full gap-1 overflow-x-auto border-b border-neutral-950/10 pt-5">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectionMode === 'recipes'}
                    onClick={() => setSelectionMode('recipes')}
                    className={`shrink-0 rounded-t-lg px-3 py-2 text-sm/5 font-medium focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 ${selectionMode === 'recipes' ? 'bg-neutral-200/70 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                  >
                    Saved recipes ({savedRecipes.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectionMode === 'plugins'}
                    onClick={() => setSelectionMode('plugins')}
                    className={`shrink-0 rounded-t-lg px-3 py-2 text-sm/5 font-medium focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 ${selectionMode === 'plugins' ? 'bg-neutral-200/70 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                  >
                    Choose plugins ({plugins.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectionMode === 'themes'}
                    onClick={() => setSelectionMode('themes')}
                    className={`shrink-0 rounded-t-lg px-3 py-2 text-sm/5 font-medium focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 ${selectionMode === 'themes' ? 'bg-neutral-200/70 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                  >
                    Choose themes ({themes.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectionMode === 'history'}
                    onClick={() => setSelectionMode('history')}
                    className={`shrink-0 rounded-t-lg px-3 py-2 text-sm/5 font-medium focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 ${selectionMode === 'history' ? 'bg-neutral-200/70 text-neutral-950' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                  >
                    Past spin-ups ({spinupHistory.length})
                  </button>
                </div>

                {selectionMode === 'recipes' ? (
                  <div className="pt-5">
                    {savedRecipes.length ? (
                      <div className="rounded-[min(1vw,var(--radius-xl))] bg-white p-4 ring-1 ring-neutral-950/8">
                        {savedRecipes.map((record) => (
                          <SavedRecipeRow
                            key={record.id}
                            record={record}
                            active={activeSavedId === record.id}
                            editing={editingSavedId === record.id}
                            missingCount={record.recipe.plugins.filter((id) => !plugins.some((plugin) => plugin.id === id)).length + (record.recipe.theme && !themes.some((theme) => theme.id === record.recipe.theme) ? 1 : 0)}
                            onChoose={chooseSavedRecipe}
                            onEdit={editSavedRecipe}
                            onRemove={removeSavedRecipe}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5">
                        <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">No saved recipes yet.</p>
                        <p className="max-w-[56ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Choose plugins, name the setup, then save it for one-click reuse.</p>
                        <button
                          type="button"
                          onClick={() => setSelectionMode('plugins')}
                          className="relative inline-flex items-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                          <FolderOpenIcon className="size-4 shrink-0 fill-neutral-500" />
                          Choose plugins
                        </button>
                      </div>
                    )}
                  </div>
                ) : selectionMode === 'history' ? (
                  <div className="pt-5">
                    {spinupHistory.length ? (
                      <div className="grid gap-1 rounded-[min(1vw,var(--radius-xl))] bg-white p-2 ring-1 ring-neutral-950/8">
                        {spinupHistory.map((record) => (
                          <SpinupHistoryRow
                            key={record.id}
                            record={record}
                            active={activeSpinupId === record.id}
                            missingCount={record.recipe.plugins.filter((id) => !plugins.some((plugin) => plugin.id === id)).length + (record.recipe.theme && !themes.some((theme) => theme.id === record.recipe.theme) ? 1 : 0)}
                            persistenceLabel={spinupPersistenceLabel(record, readPersistedSites())}
                            onChoose={chooseSpinup}
                            onRemove={removeSpinup}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5">
                        <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">No past spin-ups yet.</p>
                        <p className="max-w-[56ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Successful launches appear here. Browser-saved rows can resume the site; temporary rows only restore the setup. The latest 30 records stay in this browser.</p>
                      </div>
                    )}
                  </div>
                ) : selectionMode === 'themes' ? (
                  <div className="pt-5">
                    <div className="grid gap-4">
                      <p className="max-w-[62ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Choose one uploaded premium theme or search the official WordPress.org directory. Uploaded packages always appear first.</p>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative min-w-0 flex-1">
                          <label htmlFor="theme-search" className="sr-only">Search uploaded and WordPress.org themes</label>
                          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 shrink-0 -translate-y-1/2 fill-neutral-400" />
                          <input
                            id="theme-search"
                            name="theme-search"
                            type="search"
                            value={themeSearch}
                            onChange={(event) => setThemeSearch(event.target.value)}
                            placeholder="Search uploaded and WordPress.org themes"
                            autoComplete="off"
                            className="w-full rounded-lg bg-white py-2.5 pr-3 pl-9 text-base/7 text-neutral-900 ring-1 ring-neutral-950/10 outline-none placeholder:text-neutral-500 focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => themeZipInputRef.current?.click()}
                          className="relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                          <PlusIcon className="size-4 shrink-0 fill-neutral-500" />
                          Add theme ZIPs
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 pt-5">
                      <section aria-labelledby="uploaded-themes-heading" className="grid gap-2">
                        <h3 id="uploaded-themes-heading" className="font-mono text-base/7 tracking-wide text-neutral-500 sm:text-sm/6">UPLOADED THEMES</h3>
                        <div className="rounded-[min(1vw,var(--radius-xl))] bg-white p-4 ring-1 ring-neutral-950/8">
                        <div className="border-b border-neutral-950/8 pb-4 text-base/7 sm:text-sm/6">
                          <Radio
                            id="theme-default"
                            name="premium-theme"
                            checked={!recipe.theme && !recipe.repositoryTheme}
                            onChange={() => chooseTheme('')}
                            label="WordPress default theme"
                            description="Do not install or activate another theme"
                          />
                        </div>
                        {visibleThemes.length ? (
                          visibleThemes.map((theme) => (
                            <ThemeRow
                              key={theme.id}
                              theme={theme}
                              selected={recipe.theme === theme.id}
                              onSelect={chooseTheme}
                              onReplace={replaceThemeZip}
                              onRemove={handleRemoveTheme}
                            />
                          ))
                        ) : themes.length ? (
                          <div className="pt-4">
                            <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">No uploaded themes match your search.</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => themeZipInputRef.current?.click()}
                            className="relative grid w-full place-items-center gap-2 px-5 py-8 text-base/7 text-neutral-600 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm/6"
                          >
                            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                            <PlusIcon className="size-4 shrink-0 fill-current" />
                            Upload a premium theme ZIP
                          </button>
                        )}
                        </div>
                      </section>

                      {(themeSearch.trim().length >= 2 || recipe.repositoryTheme) && (
                        <section aria-labelledby="directory-themes-heading" className="grid gap-2" aria-live="polite" aria-busy={repositoryThemeSearchState.loading}>
                          <h3 id="directory-themes-heading" className="font-mono text-base/7 tracking-wide text-neutral-500 sm:text-sm/6">WORDPRESS.ORG THEMES</h3>
                          {repositoryThemeSearchState.loading ? (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5 text-base/7 text-neutral-600 sm:text-sm/6">Searching WordPress.org…</div>
                          ) : visibleRepositoryThemes.length ? (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-white p-4 ring-1 ring-neutral-950/8">
                              {visibleRepositoryThemes.map((theme) => (
                                <RepositoryThemeRow
                                  key={theme.slug}
                                  theme={theme}
                                  selected={recipe.repositoryTheme === theme.slug}
                                  onSelect={chooseRepositoryTheme}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5">
                              <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">{repositoryThemeSearchState.message || 'No WordPress.org themes matched your search.'}</p>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-5">
                    <div className="grid gap-4">
                      <p className="max-w-[62ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Search your uploaded premium plugins and the official WordPress.org directory together. Uploaded packages always appear first.</p>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative min-w-0 flex-1">
                          <label htmlFor="plugin-search" className="sr-only">Search uploaded and WordPress.org plugins</label>
                          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 shrink-0 -translate-y-1/2 fill-neutral-400" />
                          <input
                            id="plugin-search"
                            name="plugin-search"
                            type="search"
                            value={pluginSearch}
                            onChange={(event) => setPluginSearch(event.target.value)}
                            placeholder="Search uploaded and WordPress.org plugins"
                            autoComplete="off"
                            className="w-full rounded-lg bg-white py-2.5 pr-3 pl-9 text-base/7 text-neutral-900 ring-1 ring-neutral-950/10 outline-none placeholder:text-neutral-500 focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => zipInputRef.current?.click()}
                          className="relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                          <PlusIcon className="size-4 shrink-0 fill-neutral-500" />
                          Add ZIPs
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 pt-5">
                      <section aria-labelledby="uploaded-plugins-heading" className="grid gap-2">
                        <h3 id="uploaded-plugins-heading" className="font-mono text-base/7 tracking-wide text-neutral-500 sm:text-sm/6">UPLOADED PLUGINS</h3>
                        {visiblePlugins.length ? (
                          <div className="rounded-[min(1vw,var(--radius-xl))] bg-white p-4 ring-1 ring-neutral-950/8">
                            {visiblePlugins.map((plugin) => (
                              <PluginRow
                                key={plugin.id}
                                plugin={plugin}
                                selected={recipe.plugins.includes(plugin.id)}
                                onToggle={togglePlugin}
                                onReplace={replacePluginZip}
                                onRemove={handleRemovePlugin}
                              />
                            ))}
                          </div>
                        ) : plugins.length ? (
                          <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5">
                            <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">No uploaded plugins match your search.</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => zipInputRef.current?.click()}
                            className="relative grid w-full place-items-center gap-2 rounded-[min(1vw,var(--radius-xl))] border border-dashed border-neutral-950/20 bg-white/60 px-5 py-10 text-base/7 text-neutral-600 hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm/6"
                          >
                            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                            <PlusIcon className="size-4 shrink-0 fill-current" />
                            Upload premium plugin ZIPs
                          </button>
                        )}
                      </section>

                      {(pluginSearch.trim().length >= 2 || recipe.repositoryPlugins.length > 0) && (
                        <section aria-labelledby="directory-plugins-heading" className="grid gap-2" aria-live="polite" aria-busy={repositoryPluginSearchState.loading}>
                          <h3 id="directory-plugins-heading" className="font-mono text-base/7 tracking-wide text-neutral-500 sm:text-sm/6">WORDPRESS.ORG PLUGINS</h3>
                          {repositoryPluginSearchState.loading ? (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5 text-base/7 text-neutral-600 sm:text-sm/6">Searching WordPress.org…</div>
                          ) : visibleRepositoryPlugins.length ? (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-white p-4 ring-1 ring-neutral-950/8">
                              {visibleRepositoryPlugins.map((plugin) => (
                                <RepositoryPluginRow
                                  key={plugin.slug}
                                  plugin={plugin}
                                  selected={recipe.repositoryPlugins.includes(plugin.slug)}
                                  onToggle={toggleRepositoryPlugin}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-[min(1vw,var(--radius-xl))] bg-neutral-100 p-5">
                              <p className="text-pretty text-base/7 font-medium text-neutral-900 sm:text-sm/6">{repositoryPluginSearchState.message || 'No WordPress.org plugins matched your search.'}</p>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  </div>
                )}

                <input ref={zipInputRef} type="file" name="plugin-zips" accept="application/zip,.zip" multiple className="hidden" onChange={handleZipImport} />
                <input ref={replacementZipInputRef} type="file" name="replacement-plugin-zip" accept="application/zip,.zip" className="hidden" onChange={handleReplacementZip} />
                <input ref={themeZipInputRef} type="file" name="theme-zips" accept="application/zip,.zip" multiple className="hidden" onChange={handleThemeZipImport} />
                <input ref={replacementThemeZipInputRef} type="file" name="replacement-theme-zip" accept="application/zip,.zip" className="hidden" onChange={handleReplacementThemeZip} />
              </section>

              <section aria-labelledby="recipe-heading" className="border-t border-neutral-950/10 pt-6">
                <div className="grid gap-2">
                  <label htmlFor="recipe-name" id="recipe-heading" className="text-xl font-semibold">3. Name and save</label>
                  {editingSavedId && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 px-3 py-2 text-base/7 text-teal-900 ring-1 ring-teal-700/15 sm:text-sm/6">
                      <span>Editing saved recipe. Updating also applies a renamed recipe without leaving the old copy behind.</span>
                      <button
                        type="button"
                        onClick={() => setEditingSavedId('')}
                        className="relative shrink-0 rounded-md px-2 py-1 font-medium hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                      >
                        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                        Stop editing
                      </button>
                    </div>
                  )}
                  <input
                    id="recipe-name"
                    name="recipe-name"
                    type="text"
                    value={recipe.name}
                    onChange={(event) => updateRecipe({ name: event.target.value })}
                    className="rounded-lg bg-white px-3 py-2.5 text-base/7 text-neutral-900 ring-1 ring-neutral-950/10 outline-none focus-visible:outline-2 -outline-offset-1 focus-visible:outline-teal-600 sm:py-2 sm:text-sm/6"
                  />
                  <p className="max-w-[56ch] text-pretty text-base/7 text-neutral-600 sm:text-sm/6">Save it in this browser for one-click reuse, or export safe JSON for Codex to adjust.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-5">
                  <button
                    ref={launchButtonRef}
                    type="submit"
                    disabled={status.running}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 py-2.5 pr-4 pl-2.5 text-sm/5 font-medium text-white ring-1 ring-teal-700 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlayIcon className="size-4 shrink-0 fill-white" />
                    Launch {selectedPackageCount ? selectedPackageLabel : 'WordPress'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRecipe}
                    className="relative inline-flex items-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  >
                    <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                    <BookmarkIcon className="size-4 shrink-0 fill-neutral-500" />
                    {editingSavedId ? 'Update recipe' : 'Save recipe'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRecipeExport}
                    className="relative inline-flex items-center gap-1.5 rounded-lg bg-white py-2 pr-3 pl-2 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  >
                    <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
                    <ArrowDownTrayIcon className="size-4 shrink-0 fill-neutral-500" />
                    Export recipe
                  </button>
                </div>
              </section>
            </form>
          </div>

          <LaunchSummary
            recipe={recipe}
            selectedPackageLabel={selectedPackageLabel}
            status={status}
            error={error}
            onLaunch={launch}
          />
        </div>
      </main>

      <section className={showPlayground ? 'fixed inset-0 z-50 grid bg-white' : 'hidden'} aria-label="WordPress Playground">
        <div className="grid min-h-0 grid-rows-[2rem_1fr] overflow-hidden bg-white">
          <div className="flex min-w-0 items-center gap-1.5 bg-[#1d2327] px-2 text-white">
            {confirmingPlaygroundClose ? (
              <>
                <p className="min-w-0 flex-1 truncate text-sm/5 font-medium">Discard this temporary site?</p>
                <button
                  type="button"
                  onClick={() => setConfirmingPlaygroundClose(false)}
                  className="relative shrink-0 rounded-md px-2 py-1 text-sm/5 font-medium text-neutral-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                >
                  Keep open
                </button>
                <button
                  type="button"
                  onClick={closePlayground}
                  className="relative shrink-0 rounded-md bg-red-500/15 px-2 py-1 text-sm/5 font-medium text-red-100 ring-1 ring-red-300/20 hover:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                >
                  Discard and close
                </button>
              </>
            ) : (
              <>
            <p className="min-w-0 flex-1 truncate text-sm/5 font-medium">{recipe.name}</p>
            <button
              ref={licenseButtonRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={showLicenseManager}
              onClick={() => setShowLicenseManager(true)}
              className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1 pr-2.5 pl-1 text-sm/5 font-medium text-white ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white [anchor-name:--license-trigger]"
            >
              <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
              <KeyIcon className="size-4 shrink-0 fill-neutral-300" />
              Licenses
            </button>
            <button
              type="button"
              disabled={status.step <= 2 || snapshotExporting}
              title={status.step <= 2 ? 'Available when setup finishes' : undefined}
              onClick={exportSiteSnapshot}
              className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1 pr-2.5 pl-1 text-sm/5 font-medium text-white ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
              <ArrowDownTrayIcon className="size-4 shrink-0 fill-neutral-300" />
              {snapshotExporting ? 'Exporting…' : 'Export snapshot'}
            </button>
            <button
              type="button"
              disabled={status.step <= 2 || updateCheck.checking}
              title={status.step <= 2 ? 'Available when setup finishes' : undefined}
              onClick={updateAllPackages}
              className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1 pr-2.5 pl-1 text-sm/5 font-medium text-white ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
              <ArrowPathIcon className="size-4 shrink-0 fill-neutral-300" />
              {updateCheck.checking ? 'Updating…' : 'Update all'}
            </button>
            <span className="sr-only" aria-live="polite">{updateCheck.message}</span>
            <button
              type="button"
              aria-label="Close Playground"
              onClick={requestPlaygroundClose}
              className="relative shrink-0 rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            >
              <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
              <XMarkIcon className="size-4 shrink-0 fill-current" />
            </button>
              </>
            )}
          </div>
          <iframe ref={iframeRef} title="WordPress Playground" className="size-full bg-white" />
        </div>
      </section>
      {showLicenseManager && <LicenseManager packages={licensePackages} anchorRef={licenseButtonRef} onClose={() => setShowLicenseManager(false)} />}
    </div>
  )
}
