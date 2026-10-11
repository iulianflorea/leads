import { type ReactNode, useState } from 'react'
import { FileSpreadsheet, Sheet, UploadCloud } from 'lucide-react'
import { useImport } from '@renderer/stores/import'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'
import { Button } from '@renderer/components/ui'
import { toast } from '@renderer/stores/toast'

export function FileStep(): ReactNode {
  const { busy, file, openPath, selectSheet, reset } = useImport()
  const [dragging, setDragging] = useState(false)

  const pick = async (): Promise<void> => {
    try {
      const path = await call('import:pickFile')
      if (path) await openPath(path)
    } catch (error) {
      toast.error(error)
    }
  }

  if (file && file.sheets.length > 1) {
    return (
      <div className="stack">
        <div>
          <h2 className="section-title">{t('import.chooseSheet')}</h2>
          <p className="muted">{t('import.chooseSheetHint')}</p>
        </div>
        <div className="sheet-grid">
          {file.sheets.map((s) => (
            <button
              key={s.name}
              type="button"
              className="sheet-card"
              disabled={busy}
              onClick={() => void selectSheet(s.name)}
            >
              <Sheet size={20} />
              <span className="sheet-name truncate">{s.name}</span>
              <span className="subtle">{tp('import.sheetRows', s.rowCount)}</span>
            </button>
          ))}
        </div>
        <div>
          <Button variant="ghost" onClick={reset}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cx('dropzone', dragging && 'dropzone-active')}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) void openPath(window.lm.getPathForFile(dropped))
      }}
    >
      <div className="dropzone-icon" aria-hidden>
        {busy ? (
          <span className="spinner" />
        ) : dragging ? (
          <UploadCloud size={28} />
        ) : (
          <FileSpreadsheet size={28} />
        )}
      </div>
      <h2>
        {busy ? t('import.reading') : dragging ? t('import.dropActive') : t('import.dropTitle')}
      </h2>
      <p className="muted">{t('import.dropHint')}</p>
      <Button
        variant="primary"
        size="lg"
        onClick={() => void pick()}
        disabled={busy}
        data-testid="pick-file"
      >
        {t('import.chooseFile')}
      </Button>
    </div>
  )
}
