// Settings › ai. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import { Icon } from '../../Icon/Icon'
import { AI_LOCAL_PRESETS, type AIProviderDef } from '../../../utils/aiProviders'
import { isSecretMask } from '../../../utils/secrets'
import { AI_FEATURES, DIFF_FEATURES, type AIPair, ModelSelect, AI_GLOBAL_CHIPS, headersToLines, linesToHeaders, makeCustomId, AITuning, AI_PROVIDERS } from '../shared'
import type { SettingsPage } from '../useSettingsPage'

export function AiSection({ page }: { page: SettingsPage }) {
  const { t, settings, section, aiGlobalInstr, setAiGlobalInstr, aiFeatSel, setAiFeatSel, aiFeatInstr, setAiFeatInstr, aiFeatRoom, setAiFeatRoom, aiFeatDetail, setAiFeatDetail, aiKeys, setAiKeys, aiCustoms, setAiCustoms, aiDefault, setAiDefault, liveModels, loadingModels, modelsError, showKeyFor, setShowKeyFor, showTutoFor, setShowTutoFor, fetchModels, aiDirty, saveAI } = page

              // Usable = a catalog entry with its key, or any custom — local
              // runtimes are keyless, their /models answer is the connection
              // (#169). CONNECTED is stricter: the /models answer came back.
              const usableProviders = [
                ...AI_PROVIDERS.filter(p => aiKeys[p.id]?.trim()),
                ...aiCustoms,
              ].map(p => ({ id: p.id, label: p.label }))
              const anyConnected = usableProviders.length > 0
              const connectedCount = [...AI_PROVIDERS, ...aiCustoms].filter(p => liveModels[p.id]).length
              const orphanWarn = (pair: AIPair | null) =>
                pair && !usableProviders.some(p => p.id === pair.provider)
                  ? <span className="stg-ai-warn">{t('settings.ai.keyMissing')}</span>
                  : null
              const status = (models: string[] | null | undefined, busy: boolean, idle: string) => (
                <span className={`stg-ai-status${models ? ' stg-ai-status--on' : ''}`}>
                  {models ? <><Icon name="check" size={12} />{t('settings.ai.modelsCount', models.length)}</>
                    : busy ? t('settings.ai.checking') : idle}
                </span>
              )
              return (
              <div className="stg-section stg-ai">
                <h2 className="stg-section-title">{t('settings.ai.title')}</h2>
                <p className="stg-desc">{t('settings.ai.desc')}</p>

                {/* ── 1. Providers — ONE list, catalog and customs alike, a
                    row each. No active provider: a provider that answered
                    /models is CONNECTED, and the pickers below draw from
                    every connected one. */}
                <div className="stg-ai-block stg-ai-block--first">
                  <div className="stg-ai-block-head">
                    <h3 className="stg-ai-h">{t('settings.ai.providersTitle')}</h3>
                    {connectedCount > 0 && <span className="stg-ai-count">{t('settings.ai.connectedCount', connectedCount)}</span>}
                  </div>
                  <div className="stg-ai-list">
                    {AI_PROVIDERS.map(p => {
                      const key = aiKeys[p.id] ?? ''
                      const models = liveModels[p.id]
                      const on = !!models
                      const err = modelsError[p.id]
                      const tuto = p.hasTuto && showTutoFor === p.id
                      return (
                        <div key={p.id} className={`stg-ai-row${on ? ' stg-ai-row--on' : ''}`}>
                          <div className="stg-ai-row-id">
                            <span className="stg-ai-dot" style={on ? { background: p.color } : undefined} />
                            <span className="stg-ai-provider-name" style={on ? { color: p.color } : undefined}>{p.label}</span>
                          </div>
                          <div className="stg-ai-row-input">
                            <input
                              className="stg-input stg-mono"
                              type={showKeyFor === p.id ? 'text' : 'password'}
                              value={key}
                              aria-label={t('settings.ai.apiKey', p.label)}
                              onChange={e => setAiKeys(k => ({ ...k, [p.id]: e.target.value }))}
                              onBlur={e => { if (e.target.value) fetchModels(p.id, e.target.value) }}
                              title={isSecretMask(key) ? t('settings.secretHeld') : undefined}
                              placeholder={p.keyPlaceholder}
                            />
                            <button type="button" className="stg-eye" onClick={() => setShowKeyFor(v => v === p.id ? null : p.id)}
                              title={showKeyFor === p.id ? t('settings.ai.hide') : t('settings.ai.show')}>
                              <Icon name={showKeyFor === p.id ? 'eyeOff' : 'eye'} size={14} />
                            </button>
                          </div>
                          <div className="stg-ai-row-status">
                            {status(models, !!loadingModels[p.id], key ? t('settings.ai.keyUnverified') : t('settings.ai.noKey'))}
                            {p.hasTuto && !on && (
                              <button type="button" className="stg-ai-link" aria-expanded={!!tuto}
                                onClick={() => setShowTutoFor(v => v === p.id ? null : p.id)}>
                                {t('settings.ai.getKey')}
                              </button>
                            )}
                          </div>
                          {(err || tuto) && (
                            <div className="stg-ai-row-sub">
                              {err && <span className="stg-models-error">{err}</span>}
                              {tuto && (
                                <ol className="stg-tuto-steps">
                                  {(t(`settings.ai.tuto.${p.id}` as any) as unknown as string[]).map((step: string, i: number) => <li key={i}>{step}</li>)}
                                </ol>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* ── Custom endpoints — the local story (#169). Anything
                        speaking the OpenAI dialect: an Ollama, an LM Studio, a
                        gateway. Keyless is normal here; reaching /models is
                        what CONNECTED means for a runtime with no key to give. */}
                    {aiCustoms.map((c, i) => {
                      const models = liveModels[c.id]
                      const on = !!models
                      const err = modelsError[c.id]
                      const upd = (patch: Partial<AIProviderDef>) =>
                        setAiCustoms(a => a.map((x, j) => j === i ? { ...x, ...patch } : x))
                      const probe = () => { if (c.baseUrl) fetchModels(c.id, c.key ?? '', c.baseUrl) }
                      return (
                        <div key={c.id} className={`stg-ai-row stg-ai-row--custom${on ? ' stg-ai-row--on' : ''}`}>
                          <div className="stg-ai-row-id">
                            <span className="stg-ai-dot" />
                            <input
                              className="stg-input stg-ai-custom-name"
                              value={c.label}
                              aria-label={t('settings.ai.customName')}
                              placeholder={t('settings.ai.customName')}
                              onChange={e => upd({ label: e.target.value })}
                            />
                          </div>
                          <div className="stg-ai-row-input">
                            <input
                              className="stg-input stg-mono stg-ai-custom-url"
                              value={c.baseUrl ?? ''}
                              aria-label={t('settings.ai.customUrl')}
                              placeholder="http://localhost:11434/v1"
                              onChange={e => upd({ baseUrl: e.target.value })}
                              onBlur={probe}
                            />
                            <input
                              className="stg-input stg-mono stg-ai-custom-key"
                              type="password"
                              value={c.key ?? ''}
                              aria-label={t('settings.ai.customKeyOptional')}
                              placeholder={t('settings.ai.customKeyOptional')}
                              onChange={e => upd({ key: e.target.value })}
                              onBlur={probe}
                            />
                          </div>
                          <div className="stg-ai-row-status">
                            {status(models, !!loadingModels[c.id], t('settings.ai.notReached'))}
                            <button type="button" className="stg-ai-row-del"
                              title={t('settings.ai.customRemove')} aria-label={t('settings.ai.customRemove')}
                              onClick={() => setAiCustoms(a => a.filter((_, j) => j !== i))}>
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <div className="stg-ai-row-sub">
                            {err && <span className="stg-models-error">{err}</span>}
                            {/* Auth QUIRKS, never formats (#169 P2): rare by
                                design, so they live behind a fold. */}
                            <details className="stg-ai-quirks">
                              <summary>{t('settings.ai.authQuirks')}{(c.authHeader || c.extraHeaders) ? ' ·' : ''}</summary>
                              <input
                                className="stg-input stg-mono"
                                value={c.authHeader ?? ''}
                                aria-label={t('settings.ai.authHeaderLabel')}
                                placeholder={t('settings.ai.authHeaderLabel')}
                                onChange={e => upd({ authHeader: e.target.value.trim() || undefined })}
                              />
                              <textarea
                                className="stg-input stg-mono stg-ai-instr"
                                value={headersToLines(c.extraHeaders)}
                                aria-label={t('settings.ai.extraHeadersLabel')}
                                placeholder={t('settings.ai.extraHeadersLabel')}
                                rows={2}
                                onChange={e => upd({ extraHeaders: linesToHeaders(e.target.value) })}
                              />
                            </details>
                          </div>
                        </div>
                      )
                    })}
                    <div className="stg-ai-row stg-ai-row--add">
                      <span className="stg-ai-add-hint">{t('settings.ai.customDesc')}</span>
                      <div className="stg-ai-chips">
                        {AI_LOCAL_PRESETS.map(pr => (
                          <button key={pr.label} type="button" className="stg-ai-chip" aria-label={pr.label}
                            onClick={() => setAiCustoms(a => [...a, {
                              id: makeCustomId(pr.label, a), label: pr.label, dialect: 'openai-compat',
                              baseUrl: pr.baseUrl, key: '', custom: true,
                            }])}>+ {pr.label}</button>
                        ))}
                        <button type="button" className="stg-ai-chip" aria-label={t('settings.ai.customAdd')}
                          onClick={() => setAiCustoms(a => [...a, {
                            id: makeCustomId('endpoint', a), label: '', dialect: 'openai-compat',
                            baseUrl: '', key: '', custom: true,
                          }])}>+ {t('settings.ai.customAdd')}</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={anyConnected ? undefined : 'stg-ai-dim'}>
                  {/* ── 2. Defaults — the same shape as a feature block: the
                      model on the left, the instructions on the right. */}
                  <div className="stg-ai-block">
                    <div className="stg-ai-block-head">
                      <h3 className="stg-ai-h">{t('settings.ai.defaultsTitle')}</h3>
                    </div>
                    <p className="stg-desc stg-ai-temper">{anyConnected ? t('settings.ai.defaultsDesc') : t('settings.ai.connectFirst')}</p>
                    <AITuning
                      modelLabel={t('settings.ai.defaultModelLabel')}
                      picker={<ModelSelect value={aiDefault} onChange={v => { if (v) setAiDefault(v) }}
                        providers={usableProviders} liveModels={liveModels} />}
                      warn={orphanWarn(aiDefault)}
                      instrLabel={t('settings.ai.globalInstructions')}
                      templates={AI_GLOBAL_CHIPS}
                      templatesLabel={t('settings.ai.templates')}
                      value={aiGlobalInstr}
                      onChange={setAiGlobalInstr}
                      placeholder={t('settings.ai.globalInstructionsHint')}
                    />
                  </div>

                  {/* ── 3. Per feature — the temperament worn as a tag beside
                      the heading, in the badge colours, so it READS against
                      the badge of the model picked below it. */}
                  {AI_FEATURES.map(f => (
                    <div key={f.id} className="stg-ai-block stg-ai-feature">
                      <div className="stg-ai-block-head">
                        <h3 className="stg-ai-h">{t(f.labelKey as any)}</h3>
                        <span className={`stg-kind stg-temper${f.kind === 'fast' ? ' stg-kind--fast' : f.kind === 'thorough' ? ' stg-kind--reasoning' : ''}`}>
                          {t(`settings.ai.temperTag.${f.kind}` as any)}
                        </span>
                      </div>
                      <p className="stg-desc stg-ai-temper">{t(`settings.ai.temper.${f.kind}` as any)}</p>
                      <AITuning
                        modelLabel={t('settings.ai.modelLabel')}
                        picker={<ModelSelect
                          value={aiFeatSel[f.id] ?? null}
                          onChange={v => setAiFeatSel(m => ({ ...m, [f.id]: v }))}
                          defaultLabel={t('settings.ai.defaultModel', aiDefault.model)}
                          defaultModel={aiDefault.model}
                          suggest={f.kind === 'thorough' ? 'reasoning' : f.kind === 'fast' ? 'fast' : undefined}
                          suggestLabel={t('settings.ai.suggested')}
                          providers={usableProviders} liveModels={liveModels} />}
                        warn={orphanWarn(aiFeatSel[f.id] ?? null)}
                        instrLabel={t('settings.ai.instructionsLabel')}
                        templates={f.chips}
                        templatesLabel={t('settings.ai.templates')}
                        value={aiFeatInstr[f.id] ?? ''}
                        onChange={v => setAiFeatInstr(m => ({ ...m, [f.id]: v }))}
                        placeholder={t('settings.ai.instructionsHint')}
                      />
                      {/* How much room the answer gets. Three steps, not a
                          number: nobody can calibrate a token count, and the
                          only thing worth deciding is whether this model
                          needs more room than the feature assumed. A
                          truncation raises it on its own — and lands here,
                          where it can be seen and put back. */}
                      {/* What the model is shown. Above the reply length
                          because it comes first in the exchange — and because
                          it is the half that costs, on a paid model. Only for
                          the features that actually carry a diff. */}
                      {DIFF_FEATURES.includes(f.id) && (
                        <div className="stg-ai-room">
                          <span className="stg-ai-room-label">{t('settings.ai.diffDetail')}</span>
                          {['summary', 'standard', 'full'].map(level => (
                            <button
                              key={level}
                              type="button"
                              className={`stg-room-step${(aiFeatDetail[f.id] ?? 'standard') === level ? ' stg-room-step--on' : ''}`}
                              title={t(`settings.ai.diffDetail.${level}.hint` as any)}
                              onClick={() => setAiFeatDetail(m => ({ ...m, [f.id]: level }))}
                            >
                              {t(`settings.ai.diffDetail.${level}` as any)}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="stg-ai-room">
                        <span className="stg-ai-room-label">{t('settings.ai.replyLength')}</span>
                        {[1, 2, 4].map(step => (
                          <button
                            key={step}
                            type="button"
                            className={`stg-room-step${(aiFeatRoom[f.id] ?? 1) === step ? ' stg-room-step--on' : ''}`}
                            onClick={() => setAiFeatRoom(m => ({ ...m, [f.id]: step }))}
                          >
                            {t(`settings.ai.replyLength.${step}` as any)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* The Save rides with the scroll: the page is long and the
                    key you just pasted is at the top of it. It lights only
                    when the page differs from what it loaded or last saved. */}
                <div className="stg-ai-savebar">
                  <div className="stg-ai-savebar-inner">
                    <span className="stg-ai-savebar-note">{aiDirty ? t('settings.ai.unsaved') : ''}</span>
                    <button className="stg-save" onClick={saveAI} disabled={!aiDirty}>{t('settings.save')}</button>
                  </div>
                </div>
              </div>
              )
            
}
