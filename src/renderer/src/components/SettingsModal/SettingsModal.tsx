import React, { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { SunIcon, MoonIcon, NetMaskLogoIcon, CloseIcon, RestoreIcon, LockIcon, ShieldIcon, BoltIcon, KeyboardIcon, GithubIcon, MailIcon, DownloadIcon, RefreshIcon, DnsIcon, RadioIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { Toggle } from '../Controls/Toggle'
import { Select } from '../Controls/Select'
import { HelpTip } from '../Controls/HelpTip'
import { copyText, refreshNetworks, toggleStreamer } from '../../network-actions'
import { checkAppUpdate, downloadAppUpdate, installAppUpdate, openWebPage } from '../../update-actions'
import { errorMessage, sharingModeActive } from '../../network-state'
import styles from './SettingsModal.module.css'

export const SettingsModal: React.FC = () => {
  const { open, settings, capabilities, elevation, streamer, streamerBusy, update, downloading, progress, downloaded } = useStore(state => ({
    open: state.settingsOpen, settings: state.settings, capabilities: state.capabilities, elevation: state.elevationStatus,
    streamer: state.streamerStatus, streamerBusy: state.streamerBusy, update: state.updateInfo, downloading: state.updateDownloading, progress: state.downloadProgress, downloaded: state.downloadedVersion
  }), shallow)
  const sharing = sharingModeActive(streamer, streamerBusy)
  const [version, setVersion] = useState('…')
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [elevating, setElevating] = useState(false)
  const [trimming, setTrimming] = useState(false)
  const [dataBusy, setDataBusy] = useState(false)
  const [maskName, setMaskName] = useState(settings.streamerMaskName)
  const [tab, setTab] = useState<'general' | 'privacy' | 'tools' | 'about'>('general')
  const state = useStore.getState()
  useEffect(() => { window.nm.getVersion().then(setVersion).catch(() => setVersion('Unavailable')) }, [])
  useEffect(() => { setMaskName(settings.streamerMaskName) }, [settings.streamerMaskName])
  useEffect(() => {
    if (open) window.nm.getElevationStatus().then(state.setElevationStatus).catch(error => state.addToast(errorMessage(error), 'error'))
  }, [open])
  if (!open) return null

  const taskAction = async (remove = false) => {
    if (elevating) return
    setElevating(true)
    try {
      const result = await (remove ? window.nm.removeSilentElevation() : window.nm.setupSilentElevation())
      if (!result.success) throw new Error(result.message || 'The elevation task could not be configured')
      state.setElevationStatus(await window.nm.getElevationStatus())
      state.addToast(result.message || 'Elevation task updated', 'success')
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { setElevating(false) }
  }
  const elevate = async () => {
    setElevating(true)
    try { await window.nm.elevate() } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { setElevating(false) }
  }
  const trim = async () => {
    setTrimming(true)
    try { await window.nm.trimMemory(); state.addToast('Windows working set trimmed', 'success') }
    catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { setTrimming(false) }
  }
  const exportBackup = async () => {
    const privacy = useStore.getState()
    if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) { state.addToast('Exit sharing mode before exporting original names', 'info'); return }
    setDataBusy(true)
    try {
      const json = await window.nm.exportBackup()
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'netmask-backup.json'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      state.addToast('Backup exported', 'success')
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { setDataBusy(false) }
  }
  const importBackup = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setDataBusy(true)
      try {
        if (file.size > 1024 * 1024) throw new Error('Choose a backup smaller than 1 MiB')
        await window.nm.importBackup(await file.text())
        await refreshNetworks(true)
        state.addToast('Recovery records imported', 'success')
      } catch (error) { state.addToast(errorMessage(error), 'error') }
      finally { setDataBusy(false) }
    }
    input.click()
  }
  const restoreAll = async () => {
    const privacy = useStore.getState()
    if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) { state.addToast('Exit sharing mode before restoring original names', 'info'); return }
    if (!state.networks.some(network => network.renamed)) { state.addToast('No renamed networks to restore', 'info'); return }
    setDataBusy(true)
    try { await window.nm.restoreAll(); state.addToast('Original display names restored', 'success') }
    catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { await refreshNetworks(true).catch(error => state.addToast(errorMessage(error), 'error')); setDataBusy(false) }
  }
  const checkUpdate = async () => {
    setChecking(true); setUpdateStatus('')
    try { const info = await checkAppUpdate(); setUpdateStatus(info ? 'A new release is available.' : 'You are running the latest release.') }
    catch (error) { setUpdateStatus(errorMessage(error, 'The update check could not finish')) }
    finally { setChecking(false) }
  }
  const saveMask = async () => {
    const privacy = useStore.getState()
    if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) { setMaskName(settings.streamerMaskName); return }
    const name = maskName.trim()
    if (!name || Array.from(name).length > 128 || /[\x00-\x1f\x7f]/.test(name)) { state.addToast('Use a name of up to 128 characters without control characters.', 'error'); setMaskName(settings.streamerMaskName); return }
    if (name !== settings.streamerMaskName) await state.updateSetting('streamerMaskName', name)
  }
  const toolButtons = [
    { label: 'Keyboard controls', icon: <KeyboardIcon size={14} />, action: () => state.setShortcutsModalOpen(true), disabled: false },
    { label: 'This device and adapter', icon: <ShieldIcon size={14} />, action: () => state.setPrivacyCloakModalOpen(true), disabled: false },
    { label: 'Compare DNS resolvers', icon: <DnsIcon size={14} />, action: () => state.setDnsModalOpen(true), disabled: false },
    { label: 'Wi-Fi adapter settings', icon: <RadioIcon size={14} />, action: () => state.setRoamingModalOpen(true), disabled: capabilities?.roamingTuning === false }
  ]
  const ready = downloaded && (!update || downloaded === update.version)
  const tabs = [{ id: 'general' as const, label: 'General' }, { id: 'privacy' as const, label: 'Privacy' }, { id: 'tools' as const, label: 'Tools' }, { id: 'about' as const, label: 'About' }]
  const intervalOptions = [10, 30, 60, 0].map(value => ({ value, label: value ? 'Every ' + value + ' seconds' : 'Only when I refresh' }))
  if (![10, 30, 60, 0].includes(settings.autoRefreshInterval)) intervalOptions.push({ value: settings.autoRefreshInterval, label: 'Every ' + settings.autoRefreshInterval + ' seconds' })
  return <Dialog label="Settings" onClose={() => state.setSettingsOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <header className={styles.header}><div><p className={styles.eyebrow}>MAKE YOURSELF AT HOME</p><h2 className={styles.title}>Settings</h2></div>
      <button type="button" className={styles.closeBtn} aria-label="Close settings" onClick={() => state.setSettingsOpen(false)}><CloseIcon size={15} /></button></header>
    <nav className={styles.tabs} role="tablist" aria-label="Settings sections">{tabs.map((item, index) => <button key={item.id} id={'settings-tab-' + item.id} type="button"
      role="tab" aria-selected={tab === item.id} aria-controls="settings-panel" tabIndex={tab === item.id ? 0 : -1} className={styles.tab + (tab === item.id ? ' ' + styles.tabActive : '')}
      onClick={() => setTab(item.id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        setTab(tabs[target].id); document.getElementById('settings-tab-' + tabs[target].id)?.focus()
      }}>{item.label}</button>)}</nav>
    <div id="settings-panel" role="tabpanel" aria-labelledby={'settings-tab-' + tab} className={styles.body}>
      {tab === 'general' && <>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Everyday use</h3>
          <Toggle label="Close to the tray" sub="Keep NetMask available in the background." help="Closing the window leaves NetMask in the system tray. Display-name privacy can keep running there; live speed and ping readings pause. Choose Quit in the tray menu to exit." on={settings.minimizeToTray} onChange={value => void state.updateSetting('minimizeToTray', value)} />
          <Toggle label="Open when I sign in" sub="Start quietly in the system tray." on={settings.launchOnStartup} onChange={value => void state.updateSetting('launchOnStartup', value)} />
          <div className={styles.field}><label className="nm-field-label" htmlFor="auto-refresh-interval">Refresh saved networks <HelpTip label="Network refresh">Checks the saved profiles and current connection again. This does not reconnect your Wi-Fi. Live transfer readings have their own update timer.</HelpTip></label>
            <Select id="auto-refresh-interval" label="Refresh saved networks" value={settings.autoRefreshInterval} options={intervalOptions} onChange={value => void state.updateSetting('autoRefreshInterval', value)} /></div>
        </section>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Look and feel</h3>
          <div className={styles.themeRow}><span className="nm-field-label">Fieldnotes theme</span><div className={styles.themeGroup} role="group" aria-label="Fieldnotes theme">
            {(['light', 'dark'] as const).map(theme => <button key={theme} type="button" className={styles.themeButton + (settings.theme === theme ? ' ' + styles.themeActive : '')} aria-pressed={settings.theme === theme} onClick={() => void state.updateSetting('theme', theme)}>{theme === 'light' ? <SunIcon size={13} /> : <MoonIcon size={13} />}{theme === 'light' ? 'Paper' : 'Dark'}</button>)}
          </div></div>
          <Toggle label="Show Ethernet networks" sub="Include saved wired connections in the list." on={settings.showEthernet} onChange={value => void state.updateSetting('showEthernet', value)} />
        </section>
        <p className={styles.note}>Your choices save as you change them.</p>
      </>}
      {tab === 'privacy' && <>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Names on your screen</h3>
          <p className={styles.note}>{streamer.isCloaked ? 'Your private display name is active.' : streamer.detectedApp ? streamer.detectedApp + ' is running.' : 'Your usual display name is showing.'}</p>
          <button type="button" className={styles.button} disabled={capabilities?.networkRename === false || streamerBusy} onClick={() => void toggleStreamer()}><ShieldIcon size={13} />{streamerBusy ? 'Updating…' : streamer.isCloaked ? 'Restore my display name' : 'Use my private name'}</button>
          {streamer.error && <p className="nm-error" role="status">{sharing ? 'Sharing mode needs attention. Exit it to view the detailed error.' : streamer.error}</p>}
          <Toggle label="Use a private name with broadcast apps" sub="Recognizes OBS, Discord, Zoom, Teams, and Twitch Studio." help="Looks for supported apps that are running. It cannot tell whether you are actually recording or broadcasting. After the app closes, NetMask waits briefly before restoring your previous name." on={settings.autoCloakStreamer} disabled={capabilities?.networkRename === false} onChange={value => void state.updateSetting('autoCloakStreamer', value)} />
          <div className={styles.field}><label className="nm-field-label" htmlFor="streamer-mask-name">My private display name</label><input id="streamer-mask-name" className={styles.textInput} maxLength={256} value={maskName} disabled={sharing} onChange={event => setMaskName(event.target.value)} onBlur={() => void saveMask()} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
            {sharing && <p className={styles.note}>Exit sharing mode before changing the private name.</p>}</div>
        </section>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Router address</h3>
          <Toggle label="Hide the access point address" sub="Mask the router's BSSID inside NetMask." help="The BSSID identifies a Wi-Fi radio. Hiding it only changes what NetMask displays; it does not alter the router or the network." on={settings.bssidCloaking} onChange={value => void state.updateSetting('bssidCloaking', value)} />
          <div className={styles.field}><label className="nm-field-label" htmlFor="bssid-mask-style">How much to hide</label><Select id="bssid-mask-style" label="How much of the access point address to hide" value={settings.bssidMaskMode} disabled={!settings.bssidCloaking}
            options={[{ value: 'partial', label: 'The last half', description: 'Keep the manufacturer prefix visible.' }, { value: 'full', label: 'The whole address', description: 'Hide every part of the address.' }]} onChange={value => void state.updateSetting('bssidMaskMode', value)} /></div>
        </section>
      </>}
      {tab === 'tools' && <>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Take a closer look</h3><div className={styles.toolGrid}>
          {toolButtons.map(tool => <button key={tool.label} type="button" className={styles.toolButton} disabled={tool.disabled} onClick={tool.action}>{tool.icon}<span>{tool.label}</span><span aria-hidden="true">↗</span></button>)}
        </div></section>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Keep your originals <HelpTip label="Recovery records">Before a name changes, NetMask saves the original on this device. Export makes a copy you can keep. Import adds recovery records and keeps originals that are already saved.</HelpTip></h3>
          <p className={styles.note}>Original names stay on this device. Keep a backup somewhere you trust.</p>
          <div className={styles.buttonGroup}><button type="button" className={styles.button} disabled={dataBusy || sharing} onClick={() => void exportBackup()}>Export backup</button><button type="button" className={styles.button} disabled={dataBusy} onClick={importBackup}>Import backup</button></div>
          <button type="button" className={styles.button + ' ' + styles.danger} disabled={dataBusy || sharing || capabilities?.networkRename === false} onClick={() => void restoreAll()}><RestoreIcon size={13} />{dataBusy ? 'Working…' : 'Restore all original names'}</button>
          {sharing && <p className={styles.note}>Exit sharing mode before exporting or restoring original names.</p>}
        </section>
        {capabilities?.elevationTask && <section className={styles.section}><h3 className={styles.sectionTitle}>Windows permissions <HelpTip label="Administrator permission">Windows protects saved network labels and some adapter settings. NetMask asks for permission when one of those changes needs it. A registered task is an optional way to open an administrator copy.</HelpTip></h3>
          <p className={styles.note}>{elevation?.isElevated ? 'NetMask has administrator permission.' : elevation?.taskConfigured ? 'Your permission task is registered.' : 'Windows asks when administrator permission is needed.'}</p>
          <Toggle label="Use the registered permission task" sub="Open an administrator copy when you ask." on={settings.silentElevation} onChange={value => void state.updateSetting('silentElevation', value)} />
          <div className={styles.buttonGroup}><button type="button" className={styles.button} disabled={elevating} onClick={() => void taskAction()}><LockIcon size={13} />{elevation?.taskConfigured ? 'Register again' : 'Register task'}</button>
            {elevation?.taskConfigured && <button type="button" className={styles.button} disabled={elevating} onClick={() => void taskAction(true)}>Remove task</button>}
            {!elevation?.isElevated && <button type="button" className={styles.button} disabled={elevating} onClick={() => void elevate()}>Run as administrator</button>}
          </div>
        </section>}
        {capabilities?.platform === 'windows' && <section className={styles.section}><h3 className={styles.sectionTitle}>Memory <HelpTip label="Release unused memory">Asks Windows to trim NetMask's working set. Windows may bring that memory back when the app needs it; this does not change your network or promise lower memory use permanently.</HelpTip></h3>
          <button type="button" className={styles.button} disabled={trimming} onClick={() => void trim()}><BoltIcon size={13} />{trimming ? 'Releasing…' : 'Release unused memory'}</button></section>}
      </>}
      {tab === 'about' && <>
        <section className={styles.brandCard}><NetMaskLogoIcon size={48} /><div><h3>NetMask</h3><p>A little room for your network.</p><span>Version {version} · Fieldnotes + Orbit</span></div></section>
        <section className={styles.authorCard}><div className={styles.authorHeading}><span className={styles.authorMonogram} aria-hidden="true">BB</span><div><p className={styles.eyebrow}>CREATOR & MAINTAINER</p><h3>Bello Bilal</h3></div></div>
          <p className={styles.authorBio}>Made and maintained by Bello Bilal. Open source, under the MIT license.</p>
          <div className={styles.authorLinks}><button type="button" onClick={() => void openWebPage('https://github.com/billighost/netmask')}><GithubIcon size={14} /><span>billighost/netmask</span><span aria-hidden="true">↗</span></button><button type="button" onClick={() => void copyText('bb2010ng@gmail.com', 'Maintainer email copied')}><MailIcon size={14} /><span>bb2010ng@gmail.com</span><span className={styles.copyLabel}>Copy</span></button></div>
        </section>
        <section className={styles.section}><h3 className={styles.sectionTitle}>Updates</h3>
          <p className={styles.note}>{ready ? 'Version ' + downloaded + ' is ready to install.' : update ? 'Version ' + update.version + ' is available.' : updateStatus || 'Check for a new release on GitHub.'}</p>
          {progress && <div className={styles.progressBox}><p>{Math.round(progress.percent)}% · {(progress.transferred / 1e6).toFixed(1)} of {(progress.total / 1e6).toFixed(1)} MB</p><progress aria-label="Update download" max={100} value={progress.percent} /></div>}
          <div className={styles.buttonGroup}><button type="button" className={styles.button} disabled={checking || downloading} onClick={() => void checkUpdate()}><RefreshIcon size={13} />{checking ? 'Checking…' : 'Check for updates'}</button>
            {ready ? <button type="button" className={styles.button + ' ' + styles.primary} onClick={() => void installAppUpdate()}><DownloadIcon size={13} />Open installer</button> : update && <button type="button" className={styles.button + ' ' + styles.primary} disabled={downloading} onClick={() => void downloadAppUpdate(update)}><DownloadIcon size={13} />{downloading ? 'Downloading…' : update.downloadUrl ? 'Download update' : 'View release'}</button>}
          </div>
          {update && <button type="button" className={styles.textButton} onClick={() => void openWebPage(update.url)}>Read release notes ↗</button>}
        </section>
        <button type="button" className={styles.textButton} onClick={() => void openWebPage('https://github.com/billighost/netmask/blob/main/LICENSE')}>Read the MIT license ↗</button>
      </>}
      <footer className={styles.footer}><button type="button" className={styles.button + ' ' + styles.primary} onClick={() => state.setSettingsOpen(false)}>Done</button></footer>
    </div>
  </Dialog>
}
