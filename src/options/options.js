(function () {
    const MODELS = {
        gemini: [
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview (NEXT-GEN)', provider: 'google' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview (HYPER-SPEED)', provider: 'google' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (REASONING)', provider: 'google' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (BALANCED)', provider: 'google' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (EFFICIENT)', provider: 'google' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (FAST)', provider: 'google' }
        ],
        openai: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' }
        ],
        anthropic: [
            { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'anthropic' }
        ],
        local: [
            { id: 'llama3.1', name: 'Llama 3.1 (Local)', provider: 'local' },
            { id: 'mistral-nemo', name: 'Mistral Nemo (Local)', provider: 'local' },
            { id: 'gemma3:latest', name: 'gemma3:latest', provider: 'local' },
            { id: 'deepseek-r1', name: 'DeepSeek R1 (Local)', provider: 'local' },
            { id: 'mistral', name: 'Mistral (Legacy Local)', provider: 'local' }
        ]
    };

    const DEFAULTS = {
        aiProvider: 'local',
        keys: { google: '', openai: '', anthropic: '' },
        localEndpoint: 'http://127.0.0.1:11434',
        selectedModelId: 'gemma3:latest',
        aiAnalysisEnabled: true,
        uiLanguage: 'en'
    };

    const BACKUP_SCHEMA_VERSION = 2;
    const BACKUP_METADATA_KEY = 'backupMeta';
    const BACKUP_FILE_PREFIX = 'leetcode-easyrepeat-backup';
    const BACKUP_META_DEFAULT = {
        lastBackupAt: '',
        lastBackupFileName: '',
        lastBackupProblemCount: 0,
        lastBackupKeyCount: 0,
        lastRestoreAt: '',
        lastRestoreFileName: '',
        lastRestoreProblemCount: 0,
        lastRestoreKeyCount: 0,
        lastRestoredExportedAt: ''
    };

    const SUPPORTED_LANGUAGES = new Set([
        'en',
        'zh',
        'hi-IN',
        'ja-JP',
        'pt-BR',
        'de-DE',
        'ko-KR',
        'fr-FR',
        'pl-PL',
        'es-ES',
        'tr-TR'
    ]);

    const I18N = {
        en: {
            page_title: 'LeetCode EasyRepeat - AI Setup',
            ai_gate_heading: 'Enable AI Analysis',
            ai_gate_hint: 'Turn this on to unlock AI-powered mistake analysis and neural retention features.',
            ai_gate_enable_title: 'Enable AI Analysis',
            ai_gate_enable_subtitle: 'Allows mistake analysis, model setup, nightly digest, and drill generation.',
            ai_gate_disable_title: 'Disable AI Analysis',
            ai_gate_disable_subtitle: 'Hides AI setup and neural retention modules.',
            ai_gate_features_title: 'AI-only features when enabled:',
            ai_feature_item_1: 'Automatic wrong-answer analysis after failed submissions.',
            ai_feature_item_2: 'Local/Cloud model configuration and connection testing.',
            ai_feature_item_3: 'Backfill, nightly digest, and weak-skill drill generation.',
            ai_feature_item_4: 'Agent scheduling and debug settings.',
            model_group_local: 'Local (Ollama)',
            model_group_google: 'Google Gemini',
            model_group_openai: 'OpenAI',
            model_group_anthropic: 'Anthropic',
            status_ai_gate_enabled: 'AI analysis is enabled. AI setup and neural modules are now available.',
            status_ai_gate_disabled: 'AI analysis is disabled. AI setup and neural modules are hidden.',
            status_settings_saved: 'Settings Saved!',
            status_testing: 'Testing {url}...',
            status_test_success: 'Success! Found {count} models.',
            status_http_error: 'Error: HTTP {status}',
            status_connection_failed: 'Connection Failed: {message}',
            status_processing_history: 'Processing all history...',
            status_backfill_success: '✅ Processed {count} problems, updated {skills} skills{entries}{source}',
            status_backfill_source: ' (source: {source})',
            status_backfill_entries: ', {entries} events',
            status_no_history: 'No history found',
            status_warning_prefix: '⚠️ ',
            status_error_prefix: '❌ ',
            status_run_digest: 'Running digest...',
            status_digest_complete_detailed: '✅ Digest complete at {time}! Processed {items} items, updated {skills} skills.',
            status_digest_complete: '✅ Digest complete!',
            status_no_data: 'No data to process',
            status_generating_drills: 'Refilling drill queue...',
            status_drills_generated: '✅ Refilled +{count}. Queue now {pending}/{target} pending.{rotated}{fallback}',
            status_drills_queue_full: '✅ Queue is full: {pending}/{target} pending. Finish some drills before refilling.{cleanup}',
            status_drills_target_met: '✅ Queue is at target: {pending}/{target} pending.{cleanup}',
            status_drills_queue_snapshot: 'Queue status: {pending}/{target} pending.',
            status_drills_fallback: ' Reason: {fallback}.',
            status_drills_cleanup: ' Auto-cleaned {count} stale drill(s).',
            status_drills_rotated: ' Replaced {count} oldest pending drill(s) to make room.',
            status_no_weak_skills: 'No weak skills found',
            status_drills_cooldown: 'Please wait {seconds}s before refilling again.',
            status_fallback_queue_full: 'queue is already full',
            status_fallback_queue_target_met: 'queue already at target',
            status_fallback_cooldown: 'cooldown active',
            status_fallback_no_weak_skills: 'no weak skills detected',
            status_fallback_missing_api_key: 'no model key configured; used template drills',
            status_fallback_history_low_ratings: 'used low-rating history as weak-skill fallback',
            status_fallback_history_topics: 'used topic history as weak-skill fallback',
            status_fallback_no_history: 'no history available for weak-skill fallback',
            status_agent_saved: '✅ Settings saved!',
            tools_heading: '🧰 Tools',
            tools_hint: 'Manual maintenance utilities.',
            streak_repair_date_label: 'Date to mark active (YYYY-MM-DD)',
            streak_repair_hint: 'Use this when a streak day was missed because activity was not logged.',
            streak_repair_button: 'Repair Streak Day',
            status_streak_invalid_date: 'Invalid date. Use YYYY-MM-DD.',
            status_streak_repair_saved: '✅ Streak activity logged for {date}.',
            status_streak_repair_exists: 'ℹ️ {date} is already in your streak log.',
            backup_heading: 'Backup & Restore',
            backup_hint: 'Export a full JSON snapshot so you can recover after Chrome profile cleanup or a local storage wipe.',
            backup_note_title: 'Backup note:',
            backup_note_body: 'The backup file includes your review history, notes, settings, and saved API keys. Store it somewhere you control.',
            backup_export_button: 'Export Backup JSON',
            backup_restore_button: 'Restore from Backup File',
            backup_meta_empty: 'No manual backup recorded yet.',
            backup_meta_last_backup: 'Last export: {date} · {file} · {problems} problems / {keys} storage keys',
            backup_meta_last_restore: 'Last restore: {date} · {file} · {problems} problems / {keys} storage keys{exported}',
            backup_meta_source_exported_at: ' · backup created {date}',
            status_backup_exporting: 'Exporting backup JSON...',
            status_backup_exported: '✅ Backup exported: {file} ({problems} problems / {keys} keys).',
            status_backup_restoring: 'Restoring backup...',
            status_backup_restored: '✅ Backup restored from {file} ({problems} problems / {keys} keys).',
            status_backup_invalid: 'Invalid backup format.',
            status_backup_parse_failed: 'Could not read this backup file.',
            status_backup_restore_cancelled: 'Restore cancelled.',
            confirm_backup_restore: 'Restore this backup and replace current local data?'
        },
        zh: {
            page_title: 'LeetCode EasyRepeat - AI 设置',
            hero_title: 'LeetCode EasyRepeat',
            hero_subtitle: 'AI 设置',
            language_label: '语言',
            hero_note: '配置本地或云端 AI 提供商并验证连接。',
            ai_gate_heading: '是否开启 AI 分析',
            ai_gate_hint: '开启后才能使用 AI 错误分析与神经记忆相关功能。',
            ai_gate_enable_title: '开启 AI 分析',
            ai_gate_enable_subtitle: '可用错题分析、模型配置、夜间总结与练习生成。',
            ai_gate_disable_title: '关闭 AI 分析',
            ai_gate_disable_subtitle: '将隐藏 AI 配置与神经记忆模块。',
            ai_gate_features_title: '开启后可用功能：',
            ai_feature_item_1: '提交失败后自动进行 Wrong Answer 分析。',
            ai_feature_item_2: '本地/云端模型配置与连接测试。',
            ai_feature_item_3: '历史回填、夜间总结、薄弱技能练习生成。',
            ai_feature_item_4: 'Agent 定时与调试设置。',
            ai_configuration_heading: 'AI 配置',
            active_model_label: '当前模型（请先选择）',
            active_model_hint: '模型选项会根据当前模式（本地 / 云端）自动切换。',
            choose_intelligence_source_heading: '选择智能来源',
            local_card_title: '本地（隐私）',
            local_card_subtitle: '私密离线，但推理可靠性较低。',
            cloud_card_title: '云端 API',
            cloud_card_subtitle: '逻辑能力更强，通常付费，需要 API Key。',
            cloud_access_keys_heading: '云端访问密钥',
            cloud_key_help_link: '不知道怎么获取 API Key？点这里。',
            google_key_label: 'Google Gemini API Key',
            openai_key_label: 'OpenAI API Key',
            anthropic_key_label: 'Anthropic API Key',
            cloud_local_endpoint_note: '在 Cloud 模式下不会使用 Local Endpoint。',
            local_setup_heading: '本地 LLM 配置',
            local_setup_hint: '使用 Ollama 或 LM Studio 在本地运行模型。',
            local_quality_warning_strong: '质量提醒：',
            local_quality_warning_rest: '本地模型可能会显著降低分析质量。',
            local_warning_item_1: '在复杂 LeetCode 正确性判断和边界情况上，它们可能判断错误。',
            local_warning_item_2: '夜间总结笔记可能变得泛化、不完整或不一致。',
            local_warning_item_3: '如果你需要高置信度评分和高质量笔记，请优先使用云模型。',
            local_endpoint_label: 'Local Endpoint',
            local_endpoint_hint_html: '这不是自动发现的。它只在 Local 模式下生效，用于指向你的本地模型服务地址（默认 <code>http://127.0.0.1:11434</code>）。',
            test_connection_button: '测试连接',
            quick_setup_heading: '快速配置指南',
            quick_setup_step_1: '安装本地模型服务。',
            quick_setup_step_2: '启动服务并保持运行。',
            quick_setup_step_3: '在上方填入 Endpoint 并点击“测试连接”。',
            ollama_example_heading: 'Ollama（示例）',
            lm_studio_heading: 'LM Studio（OpenAI 兼容）',
            troubleshooting_heading: '故障排查',
            troubleshooting_item_1: '如果测试显示网络错误，通常是本地服务未启动。',
            troubleshooting_item_2: '如果看到 CORS 错误，请在本地服务中启用 CORS。',
            save_all_settings_button: '保存全部设置',
            neural_retention_heading: '🧠 神经记忆代理',
            neural_retention_hint: '手动触发总结和练习生成功能用于测试。',
            backfill_button: '📚 从历史重建技能画像（一次性）',
            run_digest_button: '⚡ 分析今天记录并更新弱项',
            generate_drills_button: '🎯 补满练习队列（基于弱项）',
            neural_note_backfill_html: '• <b>历史重建</b>：扫描全部历史提交，重建你的 Skill DNA',
            neural_note_nightly_html: '• <b>今日分析</b>：只分析今天的数据并更新弱项',
            neural_note_generate_html: '• <b>补队列</b>：把待练习队列补到目标上限',
            neural_note_generate_cap_html: '• <b>上限</b>：同一弱项最多 9 题（每种题型最多 3 题）',
            agent_settings_heading: '⚙️ Agent 设置',
            digest_time_label: '夜间总结时间：',
            pattern_threshold_label: '错误模式阈值：',
            pattern_threshold_hint: '激活一个模式所需的错误次数',
            debug_logs_label: '详细调试日志：',
            debug_logs_hint: '启用后台调试日志',
            save_agent_settings_button: '💾 保存 Agent 设置',
            model_group_local: '本地（Ollama）',
            model_group_google: 'Google Gemini',
            model_group_openai: 'OpenAI',
            model_group_anthropic: 'Anthropic',
            status_ai_gate_enabled: 'AI 分析已开启。AI 配置与神经模块现已可用。',
            status_ai_gate_disabled: 'AI 分析已关闭。AI 配置与神经模块已隐藏。',
            status_settings_saved: '设置已保存！',
            status_testing: '正在测试 {url}...',
            status_test_success: '连接成功！发现 {count} 个模型。',
            status_http_error: '错误：HTTP {status}',
            status_connection_failed: '连接失败：{message}',
            status_processing_history: '正在处理全部历史...',
            status_backfill_success: '✅ 已处理 {count} 道题，更新 {skills} 个技能{entries}{source}',
            status_backfill_source: '（来源：{source}）',
            status_backfill_entries: '，{entries} 条事件',
            status_no_history: '未找到历史记录',
            status_warning_prefix: '⚠️ ',
            status_error_prefix: '❌ ',
            status_run_digest: '正在运行总结...',
            status_digest_complete_detailed: '✅ 总结完成于 {time}！处理了 {items} 条记录，更新 {skills} 个技能。',
            status_digest_complete: '✅ 总结完成！',
            status_no_data: '没有可处理的数据',
            status_generating_drills: '正在补充练习队列...',
            status_drills_generated: '✅ 已补充 {count} 题。当前队列 {pending}/{target}（待练习/目标）。{rotated}{fallback}',
            status_drills_queue_full: '✅ 队列已满：{pending}/{target}（待练习/目标）。请先完成一些题目再补充。{cleanup}',
            status_drills_target_met: '✅ 队列已达目标：{pending}/{target}（待练习/目标）。{cleanup}',
            status_drills_queue_snapshot: '队列状态：{pending}/{target}（待练习/目标）。',
            status_drills_fallback: '原因：{fallback}。',
            status_drills_cleanup: ' 已自动清理 {count} 条旧练习。',
            status_drills_rotated: ' 已移除最旧的 {count} 条待练习以腾出位置。',
            status_no_weak_skills: '未找到薄弱技能',
            status_drills_cooldown: '请等待 {seconds} 秒后再补充。',
            status_fallback_queue_full: '队列已经满了',
            status_fallback_queue_target_met: '队列已达到目标',
            status_fallback_cooldown: '冷却中',
            status_fallback_no_weak_skills: '未识别到可用弱项',
            status_fallback_missing_api_key: '未配置可用模型，已使用模板练习',
            status_fallback_history_low_ratings: '使用了低分历史作为弱项兜底',
            status_fallback_history_topics: '使用了题目主题历史作为弱项兜底',
            status_fallback_no_history: '没有可用历史记录用于弱项兜底',
            status_agent_saved: '✅ 设置已保存！',
            tools_heading: '🧰 工具',
            tools_hint: '用于手动维护的实用工具。',
            streak_repair_date_label: '补记活跃日期（YYYY-MM-DD）',
            streak_repair_hint: '当某天活动未被记录导致断签时，可在这里补记。',
            streak_repair_button: '补记连续天数',
            status_streak_invalid_date: '日期格式错误，请使用 YYYY-MM-DD。',
            status_streak_repair_saved: '✅ 已记录 {date} 的活跃状态。',
            status_streak_repair_exists: 'ℹ️ {date} 已存在于连续记录中。',
            backup_heading: '备份与恢复',
            backup_hint: '导出完整 JSON 快照，这样即使 Chrome profile 被清理或本地存储被抹掉，也还能恢复。',
            backup_note_title: '备份提醒：',
            backup_note_body: '备份文件会包含你的复习历史、笔记、设置，以及已保存的 API Key。请放在你自己可控的位置。',
            backup_export_button: '导出备份 JSON',
            backup_restore_button: '从备份文件恢复',
            backup_meta_empty: '还没有记录到手动备份。',
            backup_meta_last_backup: '最近导出：{date} · {file} · {problems} 道题 / {keys} 个存储键',
            backup_meta_last_restore: '最近恢复：{date} · {file} · {problems} 道题 / {keys} 个存储键{exported}',
            backup_meta_source_exported_at: ' · 备份创建于 {date}',
            status_backup_exporting: '正在导出备份 JSON...',
            status_backup_exported: '✅ 备份已导出：{file}（{problems} 道题 / {keys} 个键）。',
            status_backup_restoring: '正在恢复备份...',
            status_backup_restored: '✅ 已从 {file} 恢复备份（{problems} 道题 / {keys} 个键）。',
            status_backup_invalid: '备份格式无效。',
            status_backup_parse_failed: '无法读取这个备份文件。',
            status_backup_restore_cancelled: '已取消恢复。',
            confirm_backup_restore: '恢复这个备份并覆盖当前本地数据吗？'
        }
    };

    Object.assign(I18N.en, {
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'AI Setup',
        language_label: 'Language',
        hero_note: 'Configure local or cloud AI providers and verify connections.',
        ai_configuration_heading: 'AI Configuration',
        active_model_label: 'Active Model (Choose First)',
        active_model_hint: 'Model options switch automatically based on the selected mode (Local / Cloud).',
        choose_intelligence_source_heading: 'Choose Intelligence Source',
        local_card_title: 'Local (Private)',
        local_card_subtitle: 'Private and offline, but lower reasoning reliability.',
        cloud_card_title: 'Cloud API',
        cloud_card_subtitle: 'Higher logic quality, usually paid, requires API keys.',
        cloud_access_keys_heading: 'Cloud Access Keys',
        cloud_key_help_link: 'Not sure how to get API keys? Click here.',
        google_key_label: 'Google Gemini API Key',
        openai_key_label: 'OpenAI API Key',
        anthropic_key_label: 'Anthropic API Key',
        cloud_local_endpoint_note: 'Local Endpoint is not used in Cloud mode.',
        local_setup_heading: 'Local LLM Setup',
        local_setup_hint: 'Use Ollama or LM Studio to run models locally.',
        local_quality_warning_strong: 'Quality warning:',
        local_quality_warning_rest: 'Local models can significantly reduce analysis quality.',
        local_warning_item_1: 'They may misjudge tricky LeetCode correctness and edge cases.',
        local_warning_item_2: 'Nightly digest notes can become generic, incomplete, or inconsistent.',
        local_warning_item_3: 'Use cloud models when you need high-confidence grading and high-quality notes.',
        local_endpoint_label: 'Local Endpoint',
        local_endpoint_hint_html: 'This is not auto-discovered. It is only used in Local mode to point the extension to your local model server (default <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Test Connection',
        quick_setup_heading: 'Quick Setup Guide',
        quick_setup_step_1: 'Install a local model service.',
        quick_setup_step_2: 'Start the service and keep it running.',
        quick_setup_step_3: 'Enter the endpoint above and click "Test Connection".',
        ollama_example_heading: 'Ollama (Example)',
        lm_studio_heading: 'LM Studio (OpenAI Compatible)',
        troubleshooting_heading: 'Troubleshooting',
        troubleshooting_item_1: 'If you see a network error, the local service is usually not running.',
        troubleshooting_item_2: 'If you see CORS errors, enable CORS on your local service.',
        save_all_settings_button: 'Save All Settings',
        neural_retention_heading: '🧠 Neural Retention Agent',
        neural_retention_hint: 'Manually run digest and drill generation for testing.',
        backfill_button: '📚 Rebuild Skill Profile from History (One-time)',
        run_digest_button: '⚡ Analyze Today and Update Weak Skills',
        generate_drills_button: '🎯 Refill Drill Queue (Based on Weak Skills)',
        neural_note_backfill_html: '• <b>Backfill</b>: scan all historical submissions and rebuild your Skill DNA',
        neural_note_nightly_html: '• <b>Today Analysis</b>: analyze only today data and update weak skills',
        neural_note_generate_html: '• <b>Refill Queue</b>: refill pending drills to target cap',
        neural_note_generate_cap_html: '• <b>Cap</b>: max 9 drills per weak skill (max 3 per drill type)',
        agent_settings_heading: '⚙️ Agent Settings',
        digest_time_label: 'Nightly Digest Time:',
        pattern_threshold_label: 'Error Pattern Threshold:',
        pattern_threshold_hint: 'Number of mistakes required to activate a pattern',
        debug_logs_label: 'Verbose Debug Logs:',
        debug_logs_hint: 'Enable background debug logging',
        save_agent_settings_button: '💾 Save Agent Settings'
    });

    const createLocalePack = (overrides) => ({ ...I18N.en, ...overrides });

    I18N['hi-IN'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - AI सेटअप',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'AI सेटअप',
        language_label: 'भाषा',
        hero_note: 'लोकल या क्लाउड AI प्रोवाइडर कॉन्फ़िगर करें और कनेक्शन जांचें।',
        ai_gate_heading: 'AI विश्लेषण सक्षम करें',
        ai_gate_hint: 'इसे चालू करने पर AI आधारित गलती विश्लेषण और न्यूरल रिटेंशन फीचर खुलेंगे।',
        ai_gate_enable_title: 'AI विश्लेषण चालू करें',
        ai_gate_enable_subtitle: 'गलती विश्लेषण, मॉडल सेटअप, नाइटली डाइजेस्ट और ड्रिल जनरेशन सक्षम करता है।',
        ai_gate_disable_title: 'AI विश्लेषण बंद करें',
        ai_gate_disable_subtitle: 'AI सेटअप और न्यूरल मॉड्यूल छिपा देता है।',
        ai_gate_features_title: 'चालू होने पर उपलब्ध AI फीचर:',
        ai_feature_item_1: 'फेल सबमिशन के बाद स्वचालित गलत उत्तर विश्लेषण।',
        ai_feature_item_2: 'लोकल/क्लाउड मॉडल कॉन्फ़िगरेशन और कनेक्शन टेस्टिंग।',
        ai_feature_item_3: 'बैकफिल, नाइटली डाइजेस्ट और कमजोर स्किल ड्रिल जनरेशन।',
        ai_feature_item_4: 'एजेंट शेड्यूलिंग और डिबग सेटिंग्स।',
        ai_configuration_heading: 'AI कॉन्फ़िगरेशन',
        active_model_label: 'सक्रिय मॉडल (पहले चुनें)',
        active_model_hint: 'मॉडल विकल्प चुने गए मोड (लोकल / क्लाउड) के अनुसार बदलते हैं।',
        choose_intelligence_source_heading: 'इंटेलिजेंस स्रोत चुनें',
        local_card_title: 'लोकल (प्राइवेट)',
        local_card_subtitle: 'निजी और ऑफलाइन, लेकिन रीजनिंग विश्वसनीयता कम।',
        cloud_card_title: 'क्लाउड API',
        cloud_card_subtitle: 'बेहतर लॉजिक गुणवत्ता, सामान्यतः पेड, API की आवश्यक।',
        cloud_access_keys_heading: 'क्लाउड एक्सेस की',
        cloud_key_help_link: 'API की कैसे लें समझ नहीं आ रहा? यहाँ क्लिक करें।',
        cloud_local_endpoint_note: 'क्लाउड मोड में लोकल एंडपॉइंट उपयोग नहीं होता।',
        local_setup_heading: 'लोकल LLM सेटअप',
        local_setup_hint: 'लोकल मॉडल चलाने के लिए Ollama या LM Studio का उपयोग करें।',
        local_quality_warning_strong: 'गुणवत्ता चेतावनी:',
        local_quality_warning_rest: 'लोकल मॉडल विश्लेषण गुणवत्ता को काफी कम कर सकते हैं।',
        local_warning_item_1: 'ये जटिल LeetCode correctness और edge cases में गलत निर्णय दे सकते हैं।',
        local_warning_item_2: 'नाइटली डाइजेस्ट नोट्स सामान्य, अधूरे या असंगत हो सकते हैं।',
        local_warning_item_3: 'उच्च-विश्वास स्कोरिंग और बेहतर नोट्स के लिए क्लाउड मॉडल चुनें।',
        local_endpoint_hint_html: 'यह स्वतः खोजा नहीं जाता। यह केवल Local मोड में आपकी लोकल मॉडल सेवा के पते के लिए उपयोग होता है (डिफ़ॉल्ट <code>http://127.0.0.1:11434</code>)।',
        test_connection_button: 'कनेक्शन जांचें',
        quick_setup_heading: 'त्वरित सेटअप गाइड',
        quick_setup_step_1: 'लोकल मॉडल सेवा इंस्टॉल करें।',
        quick_setup_step_2: 'सेवा शुरू करें और चालू रखें।',
        quick_setup_step_3: 'ऊपर एंडपॉइंट भरें और "कनेक्शन जांचें" दबाएँ।',
        ollama_example_heading: 'Ollama (उदाहरण)',
        lm_studio_heading: 'LM Studio (OpenAI संगत)',
        troubleshooting_heading: 'समस्या निवारण',
        troubleshooting_item_1: 'नेटवर्क त्रुटि आए तो अक्सर लोकल सेवा चालू नहीं होती।',
        troubleshooting_item_2: 'यदि CORS त्रुटि आए तो लोकल सेवा में CORS सक्षम करें।',
        save_all_settings_button: 'सभी सेटिंग्स सहेजें',
        neural_retention_heading: '🧠 न्यूरल रिटेंशन एजेंट',
        neural_retention_hint: 'टेस्ट के लिए डाइजेस्ट और ड्रिल जनरेशन को मैन्युअली चलाएँ।',
        backfill_button: '📚 इतिहास से स्किल प्रोफाइल फिर बनाएं (एक बार)',
        run_digest_button: '⚡ आज का विश्लेषण चलाएं और कमजोर स्किल अपडेट करें',
        generate_drills_button: '🎯 ड्रिल कतार भरें (कमजोर स्किल आधारित)',
        neural_note_backfill_html: '• <b>बैकफिल</b>: पूरे इतिहास को स्कैन कर Skill DNA फिर बनाएं',
        neural_note_nightly_html: '• <b>आज विश्लेषण</b>: केवल आज का डेटा विश्लेषित कर कमजोर स्किल अपडेट करें',
        neural_note_generate_html: '• <b>कतार भरें</b>: पेंडिंग ड्रिल को लक्ष्य सीमा तक भरें',
        neural_note_generate_cap_html: '• <b>सीमा</b>: प्रति कमजोर स्किल अधिकतम 9 ड्रिल (प्रति प्रकार अधिकतम 3)',
        agent_settings_heading: '⚙️ एजेंट सेटिंग्स',
        digest_time_label: 'नाइटली डाइजेस्ट समय:',
        pattern_threshold_label: 'त्रुटि पैटर्न थ्रेशोल्ड:',
        pattern_threshold_hint: 'किसी पैटर्न को सक्रिय करने के लिए आवश्यक गलतियों की संख्या',
        debug_logs_label: 'विस्तृत डिबग लॉग:',
        debug_logs_hint: 'बैकग्राउंड डिबग लॉगिंग सक्षम करें',
        save_agent_settings_button: '💾 एजेंट सेटिंग्स सहेजें',
        model_group_local: 'लोकल (Ollama)',
        status_ai_gate_enabled: 'AI विश्लेषण सक्षम है। AI सेटअप और न्यूरल मॉड्यूल उपलब्ध हैं।',
        status_ai_gate_disabled: 'AI विश्लेषण बंद है। AI सेटअप और न्यूरल मॉड्यूल छिपे हैं।',
        status_settings_saved: 'सेटिंग्स सहेजी गईं!',
        status_testing: '{url} की जांच हो रही है...',
        status_test_success: 'सफल! {count} मॉडल मिले।',
        status_http_error: 'त्रुटि: HTTP {status}',
        status_connection_failed: 'कनेक्शन विफल: {message}',
        status_processing_history: 'पूरा इतिहास प्रोसेस हो रहा है...',
        status_backfill_success: '✅ {count} समस्याएँ प्रोसेस हुईं, {skills} स्किल्स अपडेट हुईं{entries}{source}',
        status_backfill_source: ' (स्रोत: {source})',
        status_backfill_entries: ', {entries} इवेंट',
        status_no_history: 'कोई इतिहास नहीं मिला',
        status_run_digest: 'डाइजेस्ट चल रहा है...',
        status_digest_complete_detailed: '✅ डाइजेस्ट {time} पर पूरा! {items} आइटम प्रोसेस हुए, {skills} स्किल्स अपडेट हुईं।',
        status_digest_complete: '✅ डाइजेस्ट पूरा!',
        status_no_data: 'प्रोसेस करने के लिए डेटा नहीं है',
        status_generating_drills: 'ड्रिल कतार भरी जा रही है...',
        status_drills_generated: '✅ +{count} जोड़ी गईं। कतार अब {pending}/{target} पेंडिंग है।{rotated}{fallback}',
        status_drills_queue_full: '✅ कतार भरी हुई है: {pending}/{target} पेंडिंग। रीफिल से पहले कुछ ड्रिल पूरी करें।{cleanup}',
        status_drills_target_met: '✅ कतार लक्ष्य पर है: {pending}/{target} पेंडिंग।{cleanup}',
        status_drills_queue_snapshot: 'कतार स्थिति: {pending}/{target} पेंडिंग।',
        status_drills_fallback: ' कारण: {fallback}।',
        status_drills_cleanup: ' {count} पुरानी ड्रिल स्वतः साफ की गईं।',
        status_drills_rotated: ' जगह बनाने के लिए {count} सबसे पुरानी पेंडिंग ड्रिल बदली गईं।',
        status_no_weak_skills: 'कोई कमजोर स्किल नहीं मिली',
        status_drills_cooldown: 'फिर से रीफिल करने से पहले {seconds}s प्रतीक्षा करें।',
        status_fallback_queue_full: 'कतार पहले से भरी है',
        status_fallback_queue_target_met: 'कतार पहले से लक्ष्य पर है',
        status_fallback_cooldown: 'कूलडाउन सक्रिय है',
        status_fallback_no_weak_skills: 'कोई कमजोर स्किल नहीं मिली',
        status_fallback_missing_api_key: 'मॉडल की कॉन्फ़िगर नहीं; टेम्पलेट ड्रिल उपयोग की गईं',
        status_fallback_history_low_ratings: 'कम रेटिंग इतिहास को कमजोर स्किल फॉलबैक के रूप में उपयोग किया',
        status_fallback_history_topics: 'टॉपिक इतिहास को कमजोर स्किल फॉलबैक के रूप में उपयोग किया',
        status_fallback_no_history: 'कमजोर स्किल फॉलबैक के लिए इतिहास उपलब्ध नहीं',
        status_agent_saved: '✅ सेटिंग्स सहेजी गईं!',
        tools_heading: '🧰 टूल्स',
        tools_hint: 'मैन्युअल मेंटेनेंस के लिए उपयोगी टूल्स।',
        streak_repair_date_label: 'सक्रिय तारीख चिह्नित करें (YYYY-MM-DD)',
        streak_repair_hint: 'जब गतिविधि लॉग न होने से स्ट्रीक छूट जाए तब उपयोग करें।',
        streak_repair_button: 'स्ट्रीक दिवस रिपेयर करें',
        status_streak_invalid_date: 'अमान्य तारीख। YYYY-MM-DD उपयोग करें।',
        status_streak_repair_saved: '✅ {date} के लिए स्ट्रीक गतिविधि लॉग की गई।',
        status_streak_repair_exists: 'ℹ️ {date} पहले से आपके स्ट्रीक लॉग में है।'
    });

    I18N['ja-JP'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - AI 設定',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'AI 設定',
        language_label: '言語',
        hero_note: 'ローカルまたはクラウド AI プロバイダーを設定し、接続を確認します。',
        ai_gate_heading: 'AI 分析を有効化',
        ai_gate_hint: '有効化すると、AI によるミス分析とニューラル保持機能が使えます。',
        ai_gate_enable_title: 'AI 分析を有効化',
        ai_gate_enable_subtitle: 'ミス分析、モデル設定、夜間ダイジェスト、ドリル生成を有効にします。',
        ai_gate_disable_title: 'AI 分析を無効化',
        ai_gate_disable_subtitle: 'AI 設定とニューラル保持モジュールを非表示にします。',
        ai_gate_features_title: '有効化時に使える AI 機能:',
        ai_feature_item_1: '失敗した提出後に自動で Wrong Answer 分析を実行。',
        ai_feature_item_2: 'ローカル/クラウドのモデル設定と接続テスト。',
        ai_feature_item_3: '履歴バックフィル、夜間ダイジェスト、弱点スキル向けドリル生成。',
        ai_feature_item_4: 'エージェントのスケジュール設定とデバッグ設定。',
        ai_configuration_heading: 'AI 設定',
        active_model_label: '現在のモデル（先に選択）',
        active_model_hint: 'モデル候補は選択中モード（ローカル / クラウド）に応じて切り替わります。',
        choose_intelligence_source_heading: '知能ソースを選択',
        local_card_title: 'ローカル（プライベート）',
        local_card_subtitle: 'プライベートでオフラインだが、推論の信頼性は低め。',
        cloud_card_title: 'クラウド API',
        cloud_card_subtitle: '論理性能は高いが通常は有料。API キーが必要。',
        cloud_access_keys_heading: 'クラウドアクセスキー',
        cloud_key_help_link: 'API キーの取得方法が不明な場合はこちら。',
        cloud_local_endpoint_note: 'クラウドモードでは Local Endpoint は使用されません。',
        local_setup_heading: 'ローカル LLM 設定',
        local_setup_hint: 'Ollama または LM Studio でローカルモデルを実行します。',
        local_quality_warning_strong: '品質に関する注意:',
        local_quality_warning_rest: 'ローカルモデルは分析品質を大きく下げる可能性があります。',
        local_warning_item_1: '複雑な LeetCode の正誤判定や境界条件で誤判定する場合があります。',
        local_warning_item_2: '夜間ダイジェストのノートが一般的・不完全・不整合になる場合があります。',
        local_warning_item_3: '高信頼の採点や高品質ノートが必要ならクラウドモデルを優先してください。',
        local_endpoint_hint_html: 'これは自動検出されません。Local モードでのみ使用され、ローカルモデルサーバーの URL を指定します（既定 <code>http://127.0.0.1:11434</code>）。',
        test_connection_button: '接続テスト',
        quick_setup_heading: 'クイックセットアップ',
        quick_setup_step_1: 'ローカルモデルサービスをインストール。',
        quick_setup_step_2: 'サービスを起動して実行状態を維持。',
        quick_setup_step_3: '上の Endpoint を入力し「接続テスト」をクリック。',
        ollama_example_heading: 'Ollama（例）',
        lm_studio_heading: 'LM Studio（OpenAI 互換）',
        troubleshooting_heading: 'トラブルシューティング',
        troubleshooting_item_1: 'ネットワークエラーが出る場合、ローカルサービスが未起動であることが多いです。',
        troubleshooting_item_2: 'CORS エラーが出る場合はローカルサービス側で CORS を有効化してください。',
        save_all_settings_button: 'すべての設定を保存',
        neural_retention_heading: '🧠 ニューラル保持エージェント',
        neural_retention_hint: 'テスト用にダイジェストとドリル生成を手動実行できます。',
        backfill_button: '📚 履歴からスキルプロファイルを再構築（1回のみ）',
        run_digest_button: '⚡ 今日の記録を分析して弱点を更新',
        generate_drills_button: '🎯 ドリルキューを補充（弱点ベース）',
        neural_note_backfill_html: '• <b>バックフィル</b>: 全履歴提出を走査して Skill DNA を再構築',
        neural_note_nightly_html: '• <b>今日の分析</b>: 今日のデータのみ分析して弱点を更新',
        neural_note_generate_html: '• <b>キュー補充</b>: 保留ドリルを目標上限まで補充',
        neural_note_generate_cap_html: '• <b>上限</b>: 弱点スキルごとに最大 9 件（ドリル種別ごとに最大 3 件）',
        agent_settings_heading: '⚙️ エージェント設定',
        digest_time_label: '夜間ダイジェスト時刻:',
        pattern_threshold_label: 'エラーパターンしきい値:',
        pattern_threshold_hint: 'パターンを有効化するのに必要なミス回数',
        debug_logs_label: '詳細デバッグログ:',
        debug_logs_hint: 'バックグラウンドのデバッグログを有効化',
        save_agent_settings_button: '💾 エージェント設定を保存',
        model_group_local: 'ローカル（Ollama）',
        status_ai_gate_enabled: 'AI 分析が有効です。AI 設定とニューラルモジュールが利用可能になりました。',
        status_ai_gate_disabled: 'AI 分析が無効です。AI 設定とニューラルモジュールは非表示です。',
        status_settings_saved: '設定を保存しました！',
        status_testing: '{url} をテスト中...',
        status_test_success: '成功！{count} 件のモデルを検出。',
        status_http_error: 'エラー: HTTP {status}',
        status_connection_failed: '接続失敗: {message}',
        status_processing_history: '全履歴を処理中...',
        status_backfill_success: '✅ {count} 問を処理し、{skills} スキルを更新{entries}{source}',
        status_backfill_source: '（ソース: {source}）',
        status_backfill_entries: '、{entries} イベント',
        status_no_history: '履歴が見つかりません',
        status_run_digest: 'ダイジェスト実行中...',
        status_digest_complete_detailed: '✅ {time} にダイジェスト完了！{items} 件を処理し、{skills} スキルを更新。',
        status_digest_complete: '✅ ダイジェスト完了！',
        status_no_data: '処理対象データがありません',
        status_generating_drills: 'ドリルキューを補充中...',
        status_drills_generated: '✅ +{count} 件補充。現在のキューは {pending}/{target} 保留です。{rotated}{fallback}',
        status_drills_queue_full: '✅ キュー満杯: {pending}/{target} 保留。補充前にいくつか完了してください。{cleanup}',
        status_drills_target_met: '✅ キューは目標到達: {pending}/{target} 保留。{cleanup}',
        status_drills_queue_snapshot: 'キュー状態: {pending}/{target} 保留。',
        status_drills_fallback: ' 理由: {fallback}。',
        status_drills_cleanup: ' 古いドリル {count} 件を自動削除しました。',
        status_drills_rotated: ' 空きを作るため最古の保留ドリル {count} 件を置換しました。',
        status_no_weak_skills: '弱点スキルが見つかりません',
        status_drills_cooldown: '{seconds}s 待ってから再補充してください。',
        status_fallback_queue_full: 'キューはすでに満杯です',
        status_fallback_queue_target_met: 'キューはすでに目標到達です',
        status_fallback_cooldown: 'クールダウン中です',
        status_fallback_no_weak_skills: '弱点スキルが検出されません',
        status_fallback_missing_api_key: 'モデルキー未設定のためテンプレートドリルを使用',
        status_fallback_history_low_ratings: '低評価履歴を弱点スキルのフォールバックとして使用',
        status_fallback_history_topics: 'トピック履歴を弱点スキルのフォールバックとして使用',
        status_fallback_no_history: '弱点スキルのフォールバックに使える履歴がありません',
        status_agent_saved: '✅ 設定を保存しました！',
        tools_heading: '🧰 ツール',
        tools_hint: '手動メンテナンス用ユーティリティ。',
        streak_repair_date_label: 'アクティブにする日付 (YYYY-MM-DD)',
        streak_repair_hint: '活動が記録されず連続日数が欠けた日に使用します。',
        streak_repair_button: '連続日数を修復',
        status_streak_invalid_date: '日付形式が不正です。YYYY-MM-DD を使用してください。',
        status_streak_repair_saved: '✅ {date} の活動を記録しました。',
        status_streak_repair_exists: 'ℹ️ {date} はすでに連続記録に存在します。'
    });

    I18N['pt-BR'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - Configuração de IA',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'Configuração de IA',
        language_label: 'Idioma',
        hero_note: 'Configure provedores de IA locais ou em nuvem e valide as conexões.',
        ai_gate_heading: 'Ativar análise por IA',
        ai_gate_hint: 'Ative para liberar análise de erros por IA e recursos de retenção neural.',
        ai_gate_enable_title: 'Ativar análise por IA',
        ai_gate_enable_subtitle: 'Permite análise de erros, configuração de modelo, resumo noturno e geração de drills.',
        ai_gate_disable_title: 'Desativar análise por IA',
        ai_gate_disable_subtitle: 'Oculta configuração de IA e módulos neurais.',
        ai_gate_features_title: 'Recursos de IA quando ativado:',
        ai_feature_item_1: 'Análise automática de resposta errada após submissões com falha.',
        ai_feature_item_2: 'Configuração de modelo local/nuvem e teste de conexão.',
        ai_feature_item_3: 'Backfill, resumo noturno e geração de drills para habilidades fracas.',
        ai_feature_item_4: 'Agendamento do agente e configurações de depuração.',
        ai_configuration_heading: 'Configuração de IA',
        active_model_label: 'Modelo ativo (escolha primeiro)',
        active_model_hint: 'As opções de modelo mudam automaticamente conforme o modo (Local / Nuvem).',
        choose_intelligence_source_heading: 'Escolher fonte de inteligência',
        local_card_title: 'Local (Privado)',
        local_card_subtitle: 'Privado e offline, porém com menor confiabilidade de raciocínio.',
        cloud_card_title: 'API em Nuvem',
        cloud_card_subtitle: 'Melhor capacidade lógica, geralmente pago, requer chaves de API.',
        cloud_access_keys_heading: 'Chaves de acesso em nuvem',
        cloud_key_help_link: 'Não sabe como obter chaves de API? Clique aqui.',
        cloud_local_endpoint_note: 'Local Endpoint não é usado no modo Cloud.',
        local_setup_heading: 'Configuração de LLM local',
        local_setup_hint: 'Use Ollama ou LM Studio para rodar modelos localmente.',
        local_quality_warning_strong: 'Aviso de qualidade:',
        local_quality_warning_rest: 'Modelos locais podem reduzir significativamente a qualidade da análise.',
        local_warning_item_1: 'Eles podem errar avaliações de corretude e casos de borda complexos no LeetCode.',
        local_warning_item_2: 'Notas do resumo noturno podem ficar genéricas, incompletas ou inconsistentes.',
        local_warning_item_3: 'Prefira modelos em nuvem se precisar de alta confiança e notas de alta qualidade.',
        local_endpoint_hint_html: 'Isso não é descoberto automaticamente. Só é usado no modo Local para apontar para seu servidor de modelo local (padrão <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Testar conexão',
        quick_setup_heading: 'Guia rápido de configuração',
        quick_setup_step_1: 'Instale um serviço de modelo local.',
        quick_setup_step_2: 'Inicie o serviço e mantenha-o em execução.',
        quick_setup_step_3: 'Preencha o endpoint acima e clique em "Testar conexão".',
        ollama_example_heading: 'Ollama (Exemplo)',
        lm_studio_heading: 'LM Studio (Compatível com OpenAI)',
        troubleshooting_heading: 'Solução de problemas',
        troubleshooting_item_1: 'Se aparecer erro de rede, geralmente o serviço local não está em execução.',
        troubleshooting_item_2: 'Se aparecer erro de CORS, ative CORS no serviço local.',
        save_all_settings_button: 'Salvar todas as configurações',
        neural_retention_heading: '🧠 Agente de retenção neural',
        neural_retention_hint: 'Execute manualmente resumo e geração de drills para testes.',
        backfill_button: '📚 Reconstruir perfil de habilidades pelo histórico (uma vez)',
        run_digest_button: '⚡ Analisar hoje e atualizar habilidades fracas',
        generate_drills_button: '🎯 Reabastecer fila de drills (baseado em fraquezas)',
        neural_note_backfill_html: '• <b>Backfill</b>: varre todo o histórico e reconstrói seu Skill DNA',
        neural_note_nightly_html: '• <b>Análise de hoje</b>: analisa somente dados de hoje e atualiza fraquezas',
        neural_note_generate_html: '• <b>Reabastecer fila</b>: preenche drills pendentes até o alvo',
        neural_note_generate_cap_html: '• <b>Limite</b>: máximo de 9 drills por habilidade fraca (máx. 3 por tipo)',
        agent_settings_heading: '⚙️ Configurações do agente',
        digest_time_label: 'Horário do resumo noturno:',
        pattern_threshold_label: 'Limite de padrão de erro:',
        pattern_threshold_hint: 'Número de erros necessário para ativar um padrão',
        debug_logs_label: 'Logs detalhados de depuração:',
        debug_logs_hint: 'Ativar logs de depuração em background',
        save_agent_settings_button: '💾 Salvar configurações do agente',
        model_group_local: 'Local (Ollama)',
        status_ai_gate_enabled: 'A análise por IA está ativada. Configuração de IA e módulos neurais agora estão disponíveis.',
        status_ai_gate_disabled: 'A análise por IA está desativada. Configuração de IA e módulos neurais estão ocultos.',
        status_settings_saved: 'Configurações salvas!',
        status_testing: 'Testando {url}...',
        status_test_success: 'Sucesso! {count} modelos encontrados.',
        status_http_error: 'Erro: HTTP {status}',
        status_connection_failed: 'Falha na conexão: {message}',
        status_processing_history: 'Processando todo o histórico...',
        status_backfill_success: '✅ {count} problemas processados, {skills} habilidades atualizadas{entries}{source}',
        status_backfill_source: ' (fonte: {source})',
        status_backfill_entries: ', {entries} eventos',
        status_no_history: 'Nenhum histórico encontrado',
        status_run_digest: 'Executando resumo...',
        status_digest_complete_detailed: '✅ Resumo concluído às {time}! {items} itens processados, {skills} habilidades atualizadas.',
        status_digest_complete: '✅ Resumo concluído!',
        status_no_data: 'Sem dados para processar',
        status_generating_drills: 'Reabastecendo fila de drills...',
        status_drills_generated: '✅ +{count} adicionados. Fila agora em {pending}/{target} pendentes.{rotated}{fallback}',
        status_drills_queue_full: '✅ Fila cheia: {pending}/{target} pendentes. Conclua alguns drills antes de reabastecer.{cleanup}',
        status_drills_target_met: '✅ Fila no alvo: {pending}/{target} pendentes.{cleanup}',
        status_drills_queue_snapshot: 'Status da fila: {pending}/{target} pendentes.',
        status_drills_fallback: ' Motivo: {fallback}.',
        status_drills_cleanup: ' {count} drills antigos limpos automaticamente.',
        status_drills_rotated: ' {count} drills pendentes mais antigos foram substituídos para abrir espaço.',
        status_no_weak_skills: 'Nenhuma habilidade fraca encontrada',
        status_drills_cooldown: 'Aguarde {seconds}s antes de reabastecer novamente.',
        status_fallback_queue_full: 'fila já está cheia',
        status_fallback_queue_target_met: 'fila já atingiu o alvo',
        status_fallback_cooldown: 'cooldown ativo',
        status_fallback_no_weak_skills: 'nenhuma habilidade fraca detectada',
        status_fallback_missing_api_key: 'nenhuma chave de modelo configurada; drills de template usados',
        status_fallback_history_low_ratings: 'histórico de baixa avaliação usado como fallback',
        status_fallback_history_topics: 'histórico de tópicos usado como fallback',
        status_fallback_no_history: 'sem histórico disponível para fallback',
        status_agent_saved: '✅ Configurações salvas!',
        tools_heading: '🧰 Ferramentas',
        tools_hint: 'Utilitários de manutenção manual.',
        streak_repair_date_label: 'Data para marcar como ativa (YYYY-MM-DD)',
        streak_repair_hint: 'Use quando um dia da sequência foi perdido por falta de registro de atividade.',
        streak_repair_button: 'Reparar dia da sequência',
        status_streak_invalid_date: 'Data inválida. Use YYYY-MM-DD.',
        status_streak_repair_saved: '✅ Atividade da sequência registrada para {date}.',
        status_streak_repair_exists: 'ℹ️ {date} já está no seu registro de sequência.'
    });

    I18N['de-DE'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - KI-Einrichtung',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'KI-Einrichtung',
        language_label: 'Sprache',
        hero_note: 'Lokale oder Cloud-KI-Anbieter konfigurieren und Verbindung prüfen.',
        ai_gate_heading: 'KI-Analyse aktivieren',
        ai_gate_hint: 'Aktivieren, um KI-gestützte Fehleranalyse und Neural-Retention freizuschalten.',
        ai_gate_enable_title: 'KI-Analyse aktivieren',
        ai_gate_enable_subtitle: 'Ermöglicht Fehleranalyse, Modell-Setup, Nightly Digest und Drill-Generierung.',
        ai_gate_disable_title: 'KI-Analyse deaktivieren',
        ai_gate_disable_subtitle: 'Blendet KI-Setup und neuronale Module aus.',
        ai_gate_features_title: 'KI-Funktionen im aktivierten Zustand:',
        ai_feature_item_1: 'Automatische Wrong-Answer-Analyse nach fehlgeschlagenen Einreichungen.',
        ai_feature_item_2: 'Lokale/Cloud-Modellkonfiguration und Verbindungstest.',
        ai_feature_item_3: 'Backfill, Nightly Digest und Drill-Generierung für schwache Skills.',
        ai_feature_item_4: 'Agent-Zeitplanung und Debug-Einstellungen.',
        ai_configuration_heading: 'KI-Konfiguration',
        active_model_label: 'Aktives Modell (zuerst auswählen)',
        active_model_hint: 'Modelloptionen wechseln automatisch je nach Modus (Lokal / Cloud).',
        choose_intelligence_source_heading: 'Intelligenzquelle wählen',
        local_card_title: 'Lokal (Privat)',
        local_card_subtitle: 'Privat und offline, aber geringere Zuverlässigkeit beim Schlussfolgern.',
        cloud_card_title: 'Cloud-API',
        cloud_card_subtitle: 'Bessere Logikleistung, meist kostenpflichtig, API-Schlüssel erforderlich.',
        cloud_access_keys_heading: 'Cloud-Zugangsschlüssel',
        cloud_key_help_link: 'Unklar, wie man API-Schlüssel bekommt? Hier klicken.',
        cloud_local_endpoint_note: 'Im Cloud-Modus wird Local Endpoint nicht verwendet.',
        local_setup_heading: 'Lokales LLM-Setup',
        local_setup_hint: 'Mit Ollama oder LM Studio lokale Modelle ausführen.',
        local_quality_warning_strong: 'Qualitätshinweis:',
        local_quality_warning_rest: 'Lokale Modelle können die Analysequalität deutlich reduzieren.',
        local_warning_item_1: 'Sie können bei komplexer LeetCode-Korrektheitsprüfung und Edge Cases falsch liegen.',
        local_warning_item_2: 'Nightly-Digest-Notizen können generisch, unvollständig oder inkonsistent werden.',
        local_warning_item_3: 'Für hohe Bewertungssicherheit und bessere Notizen Cloud-Modelle bevorzugen.',
        local_endpoint_hint_html: 'Dies wird nicht automatisch erkannt. Es gilt nur im Local-Modus und zeigt auf deinen lokalen Modellserver (Standard <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Verbindung testen',
        quick_setup_heading: 'Schnellstart',
        quick_setup_step_1: 'Lokalen Modellservice installieren.',
        quick_setup_step_2: 'Service starten und laufen lassen.',
        quick_setup_step_3: 'Endpoint oben eintragen und auf "Verbindung testen" klicken.',
        ollama_example_heading: 'Ollama (Beispiel)',
        lm_studio_heading: 'LM Studio (OpenAI-kompatibel)',
        troubleshooting_heading: 'Fehlerbehebung',
        troubleshooting_item_1: 'Bei Netzwerkfehler läuft der lokale Dienst meist nicht.',
        troubleshooting_item_2: 'Bei CORS-Fehlern CORS im lokalen Dienst aktivieren.',
        save_all_settings_button: 'Alle Einstellungen speichern',
        neural_retention_heading: '🧠 Neural-Retention-Agent',
        neural_retention_hint: 'Digest und Drill-Generierung manuell zum Testen ausführen.',
        backfill_button: '📚 Skill-Profil aus Verlauf neu aufbauen (einmalig)',
        run_digest_button: '⚡ Heute analysieren und schwache Skills aktualisieren',
        generate_drills_button: '🎯 Drill-Warteschlange auffüllen (basierend auf Schwächen)',
        neural_note_backfill_html: '• <b>Backfill</b>: gesamten Verlauf scannen und Skill DNA neu aufbauen',
        neural_note_nightly_html: '• <b>Heute-Analyse</b>: nur heutige Daten analysieren und Schwächen aktualisieren',
        neural_note_generate_html: '• <b>Queue auffüllen</b>: offene Drills bis zur Zielgrenze auffüllen',
        neural_note_generate_cap_html: '• <b>Limit</b>: max. 9 Drills pro schwachem Skill (max. 3 pro Drill-Typ)',
        agent_settings_heading: '⚙️ Agent-Einstellungen',
        digest_time_label: 'Nightly-Digest-Zeit:',
        pattern_threshold_label: 'Fehlermuster-Schwelle:',
        pattern_threshold_hint: 'Anzahl Fehler, die ein Muster aktivieren',
        debug_logs_label: 'Ausführliche Debug-Logs:',
        debug_logs_hint: 'Debug-Logging im Hintergrund aktivieren',
        save_agent_settings_button: '💾 Agent-Einstellungen speichern',
        model_group_local: 'Lokal (Ollama)',
        status_ai_gate_enabled: 'KI-Analyse ist aktiviert. KI-Setup und neuronale Module sind jetzt verfügbar.',
        status_ai_gate_disabled: 'KI-Analyse ist deaktiviert. KI-Setup und neuronale Module sind ausgeblendet.',
        status_settings_saved: 'Einstellungen gespeichert!',
        status_testing: 'Teste {url}...',
        status_test_success: 'Erfolg! {count} Modelle gefunden.',
        status_http_error: 'Fehler: HTTP {status}',
        status_connection_failed: 'Verbindung fehlgeschlagen: {message}',
        status_processing_history: 'Gesamten Verlauf verarbeiten...',
        status_backfill_success: '✅ {count} Aufgaben verarbeitet, {skills} Skills aktualisiert{entries}{source}',
        status_backfill_source: ' (Quelle: {source})',
        status_backfill_entries: ', {entries} Ereignisse',
        status_no_history: 'Kein Verlauf gefunden',
        status_run_digest: 'Digest läuft...',
        status_digest_complete_detailed: '✅ Digest um {time} abgeschlossen! {items} Einträge verarbeitet, {skills} Skills aktualisiert.',
        status_digest_complete: '✅ Digest abgeschlossen!',
        status_no_data: 'Keine Daten zum Verarbeiten',
        status_generating_drills: 'Drill-Warteschlange wird aufgefüllt...',
        status_drills_generated: '✅ +{count} aufgefüllt. Queue jetzt {pending}/{target} ausstehend.{rotated}{fallback}',
        status_drills_queue_full: '✅ Queue voll: {pending}/{target} ausstehend. Erst einige Drills abschließen.{cleanup}',
        status_drills_target_met: '✅ Queue im Ziel: {pending}/{target} ausstehend.{cleanup}',
        status_drills_queue_snapshot: 'Queue-Status: {pending}/{target} ausstehend.',
        status_drills_fallback: ' Grund: {fallback}.',
        status_drills_cleanup: ' {count} veraltete Drills wurden automatisch bereinigt.',
        status_drills_rotated: ' {count} älteste ausstehende Drills wurden ersetzt, um Platz zu schaffen.',
        status_no_weak_skills: 'Keine schwachen Skills gefunden',
        status_drills_cooldown: 'Bitte {seconds}s warten, bevor erneut aufgefüllt wird.',
        status_fallback_queue_full: 'Queue ist bereits voll',
        status_fallback_queue_target_met: 'Queue hat Ziel bereits erreicht',
        status_fallback_cooldown: 'Cooldown aktiv',
        status_fallback_no_weak_skills: 'keine schwachen Skills erkannt',
        status_fallback_missing_api_key: 'kein Modellschlüssel konfiguriert; Template-Drills genutzt',
        status_fallback_history_low_ratings: 'niedrig bewerteter Verlauf als Fallback genutzt',
        status_fallback_history_topics: 'Themenverlauf als Fallback genutzt',
        status_fallback_no_history: 'kein Verlauf für Fallback verfügbar',
        status_agent_saved: '✅ Einstellungen gespeichert!',
        tools_heading: '🧰 Werkzeuge',
        tools_hint: 'Manuelle Wartungswerkzeuge.',
        streak_repair_date_label: 'Als aktiv markieren am Datum (YYYY-MM-DD)',
        streak_repair_hint: 'Nutzen, wenn ein Streak-Tag wegen fehlendem Aktivitätslog fehlt.',
        streak_repair_button: 'Streak-Tag reparieren',
        status_streak_invalid_date: 'Ungültiges Datum. Verwende YYYY-MM-DD.',
        status_streak_repair_saved: '✅ Streak-Aktivität für {date} protokolliert.',
        status_streak_repair_exists: 'ℹ️ {date} ist bereits im Streak-Log vorhanden.'
    });

    I18N['ko-KR'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - AI 설정',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'AI 설정',
        language_label: '언어',
        hero_note: '로컬 또는 클라우드 AI 제공자를 설정하고 연결을 확인하세요.',
        ai_gate_heading: 'AI 분석 활성화',
        ai_gate_hint: '활성화하면 AI 기반 오답 분석과 신경 유지 기능을 사용할 수 있습니다.',
        ai_gate_enable_title: 'AI 분석 켜기',
        ai_gate_enable_subtitle: '오답 분석, 모델 설정, 야간 다이제스트, 드릴 생성을 활성화합니다.',
        ai_gate_disable_title: 'AI 분석 끄기',
        ai_gate_disable_subtitle: 'AI 설정 및 신경 모듈을 숨깁니다.',
        ai_gate_features_title: '활성화 시 사용 가능한 AI 기능:',
        ai_feature_item_1: '실패한 제출 후 자동 오답 분석.',
        ai_feature_item_2: '로컬/클라우드 모델 설정 및 연결 테스트.',
        ai_feature_item_3: '백필, 야간 다이제스트, 약한 스킬 드릴 생성.',
        ai_feature_item_4: '에이전트 스케줄링 및 디버그 설정.',
        ai_configuration_heading: 'AI 구성',
        active_model_label: '활성 모델 (먼저 선택)',
        active_model_hint: '모델 옵션은 선택한 모드(로컬 / 클라우드)에 따라 자동으로 바뀝니다.',
        choose_intelligence_source_heading: '지능 소스 선택',
        local_card_title: '로컬 (프라이빗)',
        local_card_subtitle: '프라이빗하고 오프라인이지만 추론 신뢰도는 낮습니다.',
        cloud_card_title: '클라우드 API',
        cloud_card_subtitle: '논리 성능이 더 좋고 보통 유료이며 API 키가 필요합니다.',
        cloud_access_keys_heading: '클라우드 접근 키',
        cloud_key_help_link: 'API 키 발급 방법이 어렵다면 여기를 누르세요.',
        cloud_local_endpoint_note: '클라우드 모드에서는 Local Endpoint를 사용하지 않습니다.',
        local_setup_heading: '로컬 LLM 설정',
        local_setup_hint: 'Ollama 또는 LM Studio로 로컬 모델을 실행하세요.',
        local_quality_warning_strong: '품질 경고:',
        local_quality_warning_rest: '로컬 모델은 분석 품질을 크게 낮출 수 있습니다.',
        local_warning_item_1: '복잡한 LeetCode 정답 판정과 엣지 케이스를 잘못 판단할 수 있습니다.',
        local_warning_item_2: '야간 다이제스트 노트가 일반적이거나 불완전하거나 불일치할 수 있습니다.',
        local_warning_item_3: '고신뢰 채점과 고품질 노트가 필요하면 클라우드 모델을 권장합니다.',
        local_endpoint_hint_html: '자동 탐지되지 않습니다. Local 모드에서만 사용되며 로컬 모델 서버 주소를 지정합니다 (기본값 <code>http://127.0.0.1:11434</code>).',
        test_connection_button: '연결 테스트',
        quick_setup_heading: '빠른 설정 가이드',
        quick_setup_step_1: '로컬 모델 서비스를 설치하세요.',
        quick_setup_step_2: '서비스를 시작하고 계속 실행 상태로 두세요.',
        quick_setup_step_3: '위 Endpoint를 입력하고 "연결 테스트"를 누르세요.',
        ollama_example_heading: 'Ollama (예시)',
        lm_studio_heading: 'LM Studio (OpenAI 호환)',
        troubleshooting_heading: '문제 해결',
        troubleshooting_item_1: '네트워크 오류가 뜨면 보통 로컬 서비스가 꺼져 있습니다.',
        troubleshooting_item_2: 'CORS 오류가 보이면 로컬 서비스에서 CORS를 활성화하세요.',
        save_all_settings_button: '모든 설정 저장',
        neural_retention_heading: '🧠 신경 유지 에이전트',
        neural_retention_hint: '테스트를 위해 다이제스트와 드릴 생성을 수동 실행하세요.',
        backfill_button: '📚 기록에서 스킬 프로필 재구성 (1회)',
        run_digest_button: '⚡ 오늘 기록 분석 후 약한 스킬 업데이트',
        generate_drills_button: '🎯 드릴 큐 채우기 (약한 스킬 기반)',
        neural_note_backfill_html: '• <b>백필</b>: 전체 기록 제출을 스캔하여 Skill DNA 재구성',
        neural_note_nightly_html: '• <b>오늘 분석</b>: 오늘 데이터만 분석하여 약점 업데이트',
        neural_note_generate_html: '• <b>큐 채우기</b>: 대기 드릴을 목표치까지 보충',
        neural_note_generate_cap_html: '• <b>상한</b>: 약한 스킬당 최대 9개 (드릴 유형당 최대 3개)',
        agent_settings_heading: '⚙️ 에이전트 설정',
        digest_time_label: '야간 다이제스트 시간:',
        pattern_threshold_label: '오류 패턴 임계값:',
        pattern_threshold_hint: '패턴 활성화에 필요한 오류 횟수',
        debug_logs_label: '상세 디버그 로그:',
        debug_logs_hint: '백그라운드 디버그 로그 활성화',
        save_agent_settings_button: '💾 에이전트 설정 저장',
        model_group_local: '로컬 (Ollama)',
        status_ai_gate_enabled: 'AI 분석이 활성화되었습니다. AI 설정과 신경 모듈을 사용할 수 있습니다.',
        status_ai_gate_disabled: 'AI 분석이 비활성화되었습니다. AI 설정과 신경 모듈이 숨겨집니다.',
        status_settings_saved: '설정이 저장되었습니다!',
        status_testing: '{url} 테스트 중...',
        status_test_success: '성공! {count}개 모델을 찾았습니다.',
        status_http_error: '오류: HTTP {status}',
        status_connection_failed: '연결 실패: {message}',
        status_processing_history: '전체 기록 처리 중...',
        status_backfill_success: '✅ {count}문제를 처리했고 {skills}개 스킬을 업데이트했습니다{entries}{source}',
        status_backfill_source: ' (출처: {source})',
        status_backfill_entries: ', {entries}개 이벤트',
        status_no_history: '기록을 찾지 못했습니다',
        status_run_digest: '다이제스트 실행 중...',
        status_digest_complete_detailed: '✅ {time}에 다이제스트 완료! {items}개 항목 처리, {skills}개 스킬 업데이트.',
        status_digest_complete: '✅ 다이제스트 완료!',
        status_no_data: '처리할 데이터가 없습니다',
        status_generating_drills: '드릴 큐를 채우는 중...',
        status_drills_generated: '✅ +{count}개 보충. 현재 큐 {pending}/{target} 대기.{rotated}{fallback}',
        status_drills_queue_full: '✅ 큐가 가득 참: {pending}/{target} 대기. 먼저 몇 개를 완료하세요.{cleanup}',
        status_drills_target_met: '✅ 큐가 목표치에 도달: {pending}/{target} 대기.{cleanup}',
        status_drills_queue_snapshot: '큐 상태: {pending}/{target} 대기.',
        status_drills_fallback: ' 사유: {fallback}.',
        status_drills_cleanup: ' 오래된 드릴 {count}개를 자동 정리했습니다.',
        status_drills_rotated: ' 공간 확보를 위해 가장 오래된 대기 드릴 {count}개를 교체했습니다.',
        status_no_weak_skills: '약한 스킬을 찾지 못했습니다',
        status_drills_cooldown: '다시 채우기 전에 {seconds}s 기다려주세요.',
        status_fallback_queue_full: '큐가 이미 가득 찼습니다',
        status_fallback_queue_target_met: '큐가 이미 목표에 도달했습니다',
        status_fallback_cooldown: '쿨다운 활성 상태입니다',
        status_fallback_no_weak_skills: '약한 스킬이 감지되지 않았습니다',
        status_fallback_missing_api_key: '모델 키가 설정되지 않아 템플릿 드릴을 사용했습니다',
        status_fallback_history_low_ratings: '낮은 평점 기록을 약점 폴백으로 사용했습니다',
        status_fallback_history_topics: '주제 기록을 약점 폴백으로 사용했습니다',
        status_fallback_no_history: '약점 폴백에 사용할 기록이 없습니다',
        status_agent_saved: '✅ 설정이 저장되었습니다!',
        tools_heading: '🧰 도구',
        tools_hint: '수동 유지보수 유틸리티.',
        streak_repair_date_label: '활성으로 표시할 날짜 (YYYY-MM-DD)',
        streak_repair_hint: '활동이 기록되지 않아 연속일이 누락된 경우 사용하세요.',
        streak_repair_button: '연속일 복구',
        status_streak_invalid_date: '유효하지 않은 날짜입니다. YYYY-MM-DD를 사용하세요.',
        status_streak_repair_saved: '✅ {date}의 연속 활동이 기록되었습니다.',
        status_streak_repair_exists: 'ℹ️ {date}는 이미 연속 기록에 있습니다.'
    });

    I18N['fr-FR'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - Configuration IA',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'Configuration IA',
        language_label: 'Langue',
        hero_note: 'Configurez des fournisseurs IA locaux ou cloud et vérifiez la connexion.',
        ai_gate_heading: 'Activer l’analyse IA',
        ai_gate_hint: 'Activez ceci pour débloquer l’analyse des erreurs et la rétention neuronale.',
        ai_gate_enable_title: 'Activer l’analyse IA',
        ai_gate_enable_subtitle: 'Permet l’analyse des erreurs, la configuration du modèle, le digest nocturne et la génération de drills.',
        ai_gate_disable_title: 'Désactiver l’analyse IA',
        ai_gate_disable_subtitle: 'Masque la configuration IA et les modules neuronaux.',
        ai_gate_features_title: 'Fonctionnalités IA disponibles une fois activé :',
        ai_feature_item_1: 'Analyse automatique des mauvaises réponses après une soumission échouée.',
        ai_feature_item_2: 'Configuration local/cloud et test de connexion.',
        ai_feature_item_3: 'Backfill, digest nocturne et génération de drills pour compétences faibles.',
        ai_feature_item_4: 'Planification de l’agent et réglages de debug.',
        ai_configuration_heading: 'Configuration IA',
        active_model_label: 'Modèle actif (choisissez d’abord)',
        active_model_hint: 'Les options de modèle changent automatiquement selon le mode (Local / Cloud).',
        choose_intelligence_source_heading: 'Choisir la source d’intelligence',
        local_card_title: 'Local (Privé)',
        local_card_subtitle: 'Privé et hors ligne, mais fiabilité de raisonnement plus faible.',
        cloud_card_title: 'API Cloud',
        cloud_card_subtitle: 'Meilleure logique, souvent payant, nécessite des clés API.',
        cloud_access_keys_heading: 'Clés d’accès cloud',
        cloud_key_help_link: 'Vous ne savez pas comment obtenir des clés API ? Cliquez ici.',
        cloud_local_endpoint_note: 'Local Endpoint n’est pas utilisé en mode Cloud.',
        local_setup_heading: 'Configuration LLM locale',
        local_setup_hint: 'Utilisez Ollama ou LM Studio pour exécuter des modèles localement.',
        local_quality_warning_strong: 'Avertissement qualité :',
        local_quality_warning_rest: 'Les modèles locaux peuvent réduire fortement la qualité de l’analyse.',
        local_warning_item_1: 'Ils peuvent mal juger des cas limites et de la justesse complexe sur LeetCode.',
        local_warning_item_2: 'Les notes de digest nocturne peuvent devenir génériques, incomplètes ou incohérentes.',
        local_warning_item_3: 'Préférez les modèles cloud si vous avez besoin de scores fiables et de notes de qualité.',
        local_endpoint_hint_html: 'Ce champ n’est pas détecté automatiquement. Utilisé uniquement en mode Local pour pointer vers votre serveur local (par défaut <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Tester la connexion',
        quick_setup_heading: 'Guide de configuration rapide',
        quick_setup_step_1: 'Installez un service de modèle local.',
        quick_setup_step_2: 'Démarrez le service et gardez-le actif.',
        quick_setup_step_3: 'Renseignez l’endpoint ci-dessus puis cliquez sur "Tester la connexion".',
        ollama_example_heading: 'Ollama (Exemple)',
        lm_studio_heading: 'LM Studio (Compatible OpenAI)',
        troubleshooting_heading: 'Dépannage',
        troubleshooting_item_1: 'En cas d’erreur réseau, le service local est souvent arrêté.',
        troubleshooting_item_2: 'Si vous voyez des erreurs CORS, activez CORS dans le service local.',
        save_all_settings_button: 'Enregistrer tous les paramètres',
        neural_retention_heading: '🧠 Agent de rétention neuronale',
        neural_retention_hint: 'Lancez manuellement digest et génération de drills pour test.',
        backfill_button: '📚 Reconstruire le profil de compétences depuis l’historique (une fois)',
        run_digest_button: '⚡ Analyser aujourd’hui et mettre à jour les faiblesses',
        generate_drills_button: '🎯 Recharger la file de drills (basé sur les faiblesses)',
        neural_note_backfill_html: '• <b>Backfill</b> : analyser tout l’historique et reconstruire votre Skill DNA',
        neural_note_nightly_html: '• <b>Analyse du jour</b> : analyser uniquement les données du jour et mettre à jour les faiblesses',
        neural_note_generate_html: '• <b>Recharger la file</b> : remplir les drills en attente jusqu’à l’objectif',
        neural_note_generate_cap_html: '• <b>Limite</b> : max 9 drills par compétence faible (max 3 par type)',
        agent_settings_heading: '⚙️ Paramètres de l’agent',
        digest_time_label: 'Heure du digest nocturne :',
        pattern_threshold_label: 'Seuil de motif d’erreur :',
        pattern_threshold_hint: 'Nombre d’erreurs requis pour activer un motif',
        debug_logs_label: 'Logs de debug détaillés :',
        debug_logs_hint: 'Activer les logs de debug en arrière-plan',
        save_agent_settings_button: '💾 Enregistrer les paramètres de l’agent',
        model_group_local: 'Local (Ollama)',
        status_ai_gate_enabled: 'L’analyse IA est activée. Configuration IA et modules neuronaux disponibles.',
        status_ai_gate_disabled: 'L’analyse IA est désactivée. Configuration IA et modules neuronaux masqués.',
        status_settings_saved: 'Paramètres enregistrés !',
        status_testing: 'Test de {url}...',
        status_test_success: 'Succès ! {count} modèles trouvés.',
        status_http_error: 'Erreur : HTTP {status}',
        status_connection_failed: 'Échec de connexion : {message}',
        status_processing_history: 'Traitement de tout l’historique...',
        status_backfill_success: '✅ {count} problèmes traités, {skills} compétences mises à jour{entries}{source}',
        status_backfill_source: ' (source : {source})',
        status_backfill_entries: ', {entries} événements',
        status_no_history: 'Aucun historique trouvé',
        status_run_digest: 'Digest en cours...',
        status_digest_complete_detailed: '✅ Digest terminé à {time} ! {items} éléments traités, {skills} compétences mises à jour.',
        status_digest_complete: '✅ Digest terminé !',
        status_no_data: 'Aucune donnée à traiter',
        status_generating_drills: 'Recharge de la file de drills...',
        status_drills_generated: '✅ +{count} ajoutés. File à {pending}/{target} en attente.{rotated}{fallback}',
        status_drills_queue_full: '✅ File pleine : {pending}/{target} en attente. Terminez quelques drills avant de recharger.{cleanup}',
        status_drills_target_met: '✅ File à l’objectif : {pending}/{target} en attente.{cleanup}',
        status_drills_queue_snapshot: 'État de la file : {pending}/{target} en attente.',
        status_drills_fallback: ' Raison : {fallback}.',
        status_drills_cleanup: ' {count} anciens drills nettoyés automatiquement.',
        status_drills_rotated: ' {count} drills en attente les plus anciens remplacés pour faire de la place.',
        status_no_weak_skills: 'Aucune compétence faible trouvée',
        status_drills_cooldown: 'Veuillez attendre {seconds}s avant de recharger.',
        status_fallback_queue_full: 'la file est déjà pleine',
        status_fallback_queue_target_met: 'la file a déjà atteint l’objectif',
        status_fallback_cooldown: 'cooldown actif',
        status_fallback_no_weak_skills: 'aucune compétence faible détectée',
        status_fallback_missing_api_key: 'aucune clé modèle configurée ; drills modèle utilisés',
        status_fallback_history_low_ratings: 'historique faible note utilisé en fallback',
        status_fallback_history_topics: 'historique des thèmes utilisé en fallback',
        status_fallback_no_history: 'pas d’historique disponible pour fallback',
        status_agent_saved: '✅ Paramètres enregistrés !',
        tools_heading: '🧰 Outils',
        tools_hint: 'Utilitaires de maintenance manuelle.',
        streak_repair_date_label: 'Date à marquer active (YYYY-MM-DD)',
        streak_repair_hint: 'À utiliser si un jour de série a été manqué faute d’activité enregistrée.',
        streak_repair_button: 'Réparer un jour de série',
        status_streak_invalid_date: 'Date invalide. Utilisez YYYY-MM-DD.',
        status_streak_repair_saved: '✅ Activité de série enregistrée pour {date}.',
        status_streak_repair_exists: 'ℹ️ {date} existe déjà dans votre journal de série.'
    });

    I18N['pl-PL'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - Konfiguracja AI',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'Konfiguracja AI',
        language_label: 'Język',
        hero_note: 'Skonfiguruj lokalnych lub chmurowych dostawców AI i sprawdź połączenie.',
        ai_gate_heading: 'Włącz analizę AI',
        ai_gate_hint: 'Włącz, aby odblokować analizę błędów AI i funkcje retencji neuronowej.',
        ai_gate_enable_title: 'Włącz analizę AI',
        ai_gate_enable_subtitle: 'Umożliwia analizę błędów, konfigurację modelu, nocny digest i generowanie drillów.',
        ai_gate_disable_title: 'Wyłącz analizę AI',
        ai_gate_disable_subtitle: 'Ukrywa konfigurację AI i moduły neuronowe.',
        ai_gate_features_title: 'Funkcje AI dostępne po włączeniu:',
        ai_feature_item_1: 'Automatyczna analiza błędnej odpowiedzi po nieudanych wysłaniach.',
        ai_feature_item_2: 'Konfiguracja modeli lokalnych/chmurowych i test połączenia.',
        ai_feature_item_3: 'Backfill, nocny digest oraz generowanie drillów dla słabych umiejętności.',
        ai_feature_item_4: 'Harmonogram agenta i ustawienia debugowania.',
        ai_configuration_heading: 'Konfiguracja AI',
        active_model_label: 'Aktywny model (najpierw wybierz)',
        active_model_hint: 'Opcje modelu zmieniają się automatycznie zależnie od trybu (Lokalny / Chmura).',
        choose_intelligence_source_heading: 'Wybierz źródło inteligencji',
        local_card_title: 'Lokalny (Prywatny)',
        local_card_subtitle: 'Prywatnie i offline, ale niższa niezawodność rozumowania.',
        cloud_card_title: 'Cloud API',
        cloud_card_subtitle: 'Lepsza logika, zwykle płatne, wymagane klucze API.',
        cloud_access_keys_heading: 'Klucze dostępu chmurowego',
        cloud_key_help_link: 'Nie wiesz jak zdobyć klucze API? Kliknij tutaj.',
        cloud_local_endpoint_note: 'Local Endpoint nie jest używany w trybie Cloud.',
        local_setup_heading: 'Lokalna konfiguracja LLM',
        local_setup_hint: 'Użyj Ollama lub LM Studio do uruchamiania modeli lokalnie.',
        local_quality_warning_strong: 'Ostrzeżenie jakości:',
        local_quality_warning_rest: 'Modele lokalne mogą znacząco obniżyć jakość analizy.',
        local_warning_item_1: 'Mogą błędnie oceniać złożoną poprawność LeetCode i przypadki brzegowe.',
        local_warning_item_2: 'Notatki nocnego digestu mogą być zbyt ogólne, niepełne lub niespójne.',
        local_warning_item_3: 'Jeśli potrzebujesz wysokiej pewności i jakości notatek, wybierz modele chmurowe.',
        local_endpoint_hint_html: 'Nie jest wykrywany automatycznie. Działa tylko w trybie Local i wskazuje adres lokalnego serwera modeli (domyślnie <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Test połączenia',
        quick_setup_heading: 'Szybka konfiguracja',
        quick_setup_step_1: 'Zainstaluj lokalną usługę modeli.',
        quick_setup_step_2: 'Uruchom usługę i pozostaw ją aktywną.',
        quick_setup_step_3: 'Wpisz endpoint powyżej i kliknij "Test połączenia".',
        ollama_example_heading: 'Ollama (Przykład)',
        lm_studio_heading: 'LM Studio (zgodne z OpenAI)',
        troubleshooting_heading: 'Rozwiązywanie problemów',
        troubleshooting_item_1: 'Jeśli pojawia się błąd sieci, lokalna usługa zwykle nie działa.',
        troubleshooting_item_2: 'Jeśli pojawia się błąd CORS, włącz CORS w lokalnej usłudze.',
        save_all_settings_button: 'Zapisz wszystkie ustawienia',
        neural_retention_heading: '🧠 Agent retencji neuronowej',
        neural_retention_hint: 'Ręcznie uruchamiaj digest i generowanie drillów do testów.',
        backfill_button: '📚 Odbuduj profil umiejętności z historii (jednorazowo)',
        run_digest_button: '⚡ Analizuj dzisiaj i aktualizuj słabe umiejętności',
        generate_drills_button: '🎯 Uzupełnij kolejkę drillów (na podstawie słabości)',
        neural_note_backfill_html: '• <b>Backfill</b>: przeskanuj całą historię i odbuduj Skill DNA',
        neural_note_nightly_html: '• <b>Dzisiejsza analiza</b>: analizuj tylko dzisiejsze dane i aktualizuj słabości',
        neural_note_generate_html: '• <b>Uzupełnij kolejkę</b>: uzupełnij oczekujące drille do limitu',
        neural_note_generate_cap_html: '• <b>Limit</b>: maks. 9 drillów na słabą umiejętność (maks. 3 na typ)',
        agent_settings_heading: '⚙️ Ustawienia agenta',
        digest_time_label: 'Godzina nocnego digestu:',
        pattern_threshold_label: 'Próg wzorca błędów:',
        pattern_threshold_hint: 'Liczba błędów wymagana do aktywacji wzorca',
        debug_logs_label: 'Szczegółowe logi debugowania:',
        debug_logs_hint: 'Włącz logi debugowania w tle',
        save_agent_settings_button: '💾 Zapisz ustawienia agenta',
        model_group_local: 'Lokalny (Ollama)',
        status_ai_gate_enabled: 'Analiza AI jest włączona. Konfiguracja AI i moduły neuronowe są dostępne.',
        status_ai_gate_disabled: 'Analiza AI jest wyłączona. Konfiguracja AI i moduły neuronowe są ukryte.',
        status_settings_saved: 'Ustawienia zapisane!',
        status_testing: 'Testowanie {url}...',
        status_test_success: 'Sukces! Znaleziono {count} modeli.',
        status_http_error: 'Błąd: HTTP {status}',
        status_connection_failed: 'Połączenie nieudane: {message}',
        status_processing_history: 'Przetwarzanie całej historii...',
        status_backfill_success: '✅ Przetworzono {count} zadań, zaktualizowano {skills} umiejętności{entries}{source}',
        status_backfill_source: ' (źródło: {source})',
        status_backfill_entries: ', {entries} zdarzeń',
        status_no_history: 'Nie znaleziono historii',
        status_run_digest: 'Uruchamianie digestu...',
        status_digest_complete_detailed: '✅ Digest zakończony o {time}! Przetworzono {items} pozycji, zaktualizowano {skills} umiejętności.',
        status_digest_complete: '✅ Digest zakończony!',
        status_no_data: 'Brak danych do przetworzenia',
        status_generating_drills: 'Uzupełnianie kolejki drillów...',
        status_drills_generated: '✅ Dodano +{count}. Kolejka teraz {pending}/{target} oczekujących.{rotated}{fallback}',
        status_drills_queue_full: '✅ Kolejka pełna: {pending}/{target} oczekujących. Ukończ kilka drillów przed uzupełnieniem.{cleanup}',
        status_drills_target_met: '✅ Kolejka osiągnęła cel: {pending}/{target} oczekujących.{cleanup}',
        status_drills_queue_snapshot: 'Stan kolejki: {pending}/{target} oczekujących.',
        status_drills_fallback: ' Powód: {fallback}.',
        status_drills_cleanup: ' Automatycznie usunięto {count} przestarzałych drillów.',
        status_drills_rotated: ' Zastąpiono {count} najstarszych oczekujących drillów, aby zrobić miejsce.',
        status_no_weak_skills: 'Nie znaleziono słabych umiejętności',
        status_drills_cooldown: 'Poczekaj {seconds}s przed kolejnym uzupełnieniem.',
        status_fallback_queue_full: 'kolejka jest już pełna',
        status_fallback_queue_target_met: 'kolejka już osiągnęła cel',
        status_fallback_cooldown: 'cooldown aktywny',
        status_fallback_no_weak_skills: 'nie wykryto słabych umiejętności',
        status_fallback_missing_api_key: 'brak klucza modelu; użyto drillów szablonowych',
        status_fallback_history_low_ratings: 'użyto historii niskich ocen jako fallback',
        status_fallback_history_topics: 'użyto historii tematów jako fallback',
        status_fallback_no_history: 'brak historii do fallbacku słabych umiejętności',
        status_agent_saved: '✅ Ustawienia zapisane!',
        tools_heading: '🧰 Narzędzia',
        tools_hint: 'Narzędzia do ręcznej konserwacji.',
        streak_repair_date_label: 'Data do oznaczenia aktywności (YYYY-MM-DD)',
        streak_repair_hint: 'Użyj, gdy dzień serii został pominięty z powodu braku logu aktywności.',
        streak_repair_button: 'Napraw dzień serii',
        status_streak_invalid_date: 'Nieprawidłowa data. Użyj YYYY-MM-DD.',
        status_streak_repair_saved: '✅ Zapisano aktywność serii dla {date}.',
        status_streak_repair_exists: 'ℹ️ {date} już istnieje w logu serii.'
    });

    const esPack = createLocalePack({
        page_title: 'LeetCode EasyRepeat - Configuración de IA',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'Configuración de IA',
        language_label: 'Idioma',
        hero_note: 'Configura proveedores de IA local o en la nube y verifica la conexión.',
        ai_gate_heading: 'Activar análisis con IA',
        ai_gate_hint: 'Actívalo para desbloquear análisis de errores con IA y funciones de retención neural.',
        ai_gate_enable_title: 'Activar análisis con IA',
        ai_gate_enable_subtitle: 'Habilita análisis de errores, configuración de modelos, digest nocturno y generación de drills.',
        ai_gate_disable_title: 'Desactivar análisis con IA',
        ai_gate_disable_subtitle: 'Oculta la configuración de IA y los módulos neuronales.',
        ai_gate_features_title: 'Funciones de IA disponibles al activar:',
        ai_feature_item_1: 'Análisis automático de respuesta incorrecta tras envíos fallidos.',
        ai_feature_item_2: 'Configuración de modelo local/nube y prueba de conexión.',
        ai_feature_item_3: 'Backfill, digest nocturno y generación de drills para habilidades débiles.',
        ai_feature_item_4: 'Programación del agente y ajustes de depuración.',
        ai_configuration_heading: 'Configuración de IA',
        active_model_label: 'Modelo activo (elige primero)',
        active_model_hint: 'Las opciones de modelo cambian automáticamente según el modo (Local / Nube).',
        choose_intelligence_source_heading: 'Elegir fuente de inteligencia',
        local_card_title: 'Local (Privado)',
        local_card_subtitle: 'Privado y sin conexión, pero con menor fiabilidad de razonamiento.',
        cloud_card_title: 'API en la nube',
        cloud_card_subtitle: 'Mejor lógica, normalmente de pago, requiere claves API.',
        cloud_access_keys_heading: 'Claves de acceso en la nube',
        cloud_key_help_link: '¿No sabes cómo obtener claves API? Haz clic aquí.',
        cloud_local_endpoint_note: 'Local Endpoint no se usa en modo Cloud.',
        local_setup_heading: 'Configuración de LLM local',
        local_setup_hint: 'Usa Ollama o LM Studio para ejecutar modelos localmente.',
        local_quality_warning_strong: 'Aviso de calidad:',
        local_quality_warning_rest: 'Los modelos locales pueden reducir de forma notable la calidad del análisis.',
        local_warning_item_1: 'Pueden fallar en corrección compleja de LeetCode y casos límite.',
        local_warning_item_2: 'Las notas del digest nocturno pueden volverse genéricas, incompletas o inconsistentes.',
        local_warning_item_3: 'Si necesitas calificación de alta confianza y mejores notas, prioriza modelos en la nube.',
        local_endpoint_hint_html: 'No se detecta automáticamente. Solo se usa en modo Local para apuntar al servidor de modelos local (por defecto <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Probar conexión',
        quick_setup_heading: 'Guía de configuración rápida',
        quick_setup_step_1: 'Instala un servicio de modelo local.',
        quick_setup_step_2: 'Inicia el servicio y mantenlo en ejecución.',
        quick_setup_step_3: 'Introduce el endpoint arriba y haz clic en "Probar conexión".',
        ollama_example_heading: 'Ollama (Ejemplo)',
        lm_studio_heading: 'LM Studio (Compatible con OpenAI)',
        troubleshooting_heading: 'Solución de problemas',
        troubleshooting_item_1: 'Si ves error de red, normalmente el servicio local no está en ejecución.',
        troubleshooting_item_2: 'Si ves errores CORS, habilita CORS en el servicio local.',
        save_all_settings_button: 'Guardar toda la configuración',
        neural_retention_heading: '🧠 Agente de retención neural',
        neural_retention_hint: 'Ejecuta manualmente digest y generación de drills para pruebas.',
        backfill_button: '📚 Reconstruir perfil de habilidades desde historial (una sola vez)',
        run_digest_button: '⚡ Analizar hoy y actualizar habilidades débiles',
        generate_drills_button: '🎯 Rellenar cola de drills (basado en debilidades)',
        neural_note_backfill_html: '• <b>Backfill</b>: escanear todo el historial y reconstruir tu Skill DNA',
        neural_note_nightly_html: '• <b>Análisis de hoy</b>: analizar solo datos de hoy y actualizar debilidades',
        neural_note_generate_html: '• <b>Rellenar cola</b>: completar drills pendientes hasta el objetivo',
        neural_note_generate_cap_html: '• <b>Límite</b>: máximo 9 drills por habilidad débil (máx. 3 por tipo)',
        agent_settings_heading: '⚙️ Ajustes del agente',
        digest_time_label: 'Hora del digest nocturno:',
        pattern_threshold_label: 'Umbral de patrón de error:',
        pattern_threshold_hint: 'Número de errores necesario para activar un patrón',
        debug_logs_label: 'Logs de depuración detallados:',
        debug_logs_hint: 'Habilitar logs de depuración en segundo plano',
        save_agent_settings_button: '💾 Guardar ajustes del agente',
        model_group_local: 'Local (Ollama)',
        status_ai_gate_enabled: 'El análisis con IA está activado. La configuración de IA y módulos neuronales ya están disponibles.',
        status_ai_gate_disabled: 'El análisis con IA está desactivado. La configuración de IA y módulos neuronales están ocultos.',
        status_settings_saved: '¡Configuración guardada!',
        status_testing: 'Probando {url}...',
        status_test_success: '¡Éxito! Se encontraron {count} modelos.',
        status_http_error: 'Error: HTTP {status}',
        status_connection_failed: 'Conexión fallida: {message}',
        status_processing_history: 'Procesando todo el historial...',
        status_backfill_success: '✅ Se procesaron {count} problemas y se actualizaron {skills} habilidades{entries}{source}',
        status_backfill_source: ' (fuente: {source})',
        status_backfill_entries: ', {entries} eventos',
        status_no_history: 'No se encontró historial',
        status_run_digest: 'Ejecutando digest...',
        status_digest_complete_detailed: '✅ Digest completado a las {time}. Se procesaron {items} elementos y se actualizaron {skills} habilidades.',
        status_digest_complete: '✅ ¡Digest completado!',
        status_no_data: 'No hay datos para procesar',
        status_generating_drills: 'Rellenando cola de drills...',
        status_drills_generated: '✅ +{count} agregados. Cola ahora {pending}/{target} pendientes.{rotated}{fallback}',
        status_drills_queue_full: '✅ Cola llena: {pending}/{target} pendientes. Termina algunos drills antes de rellenar.{cleanup}',
        status_drills_target_met: '✅ Cola en objetivo: {pending}/{target} pendientes.{cleanup}',
        status_drills_queue_snapshot: 'Estado de la cola: {pending}/{target} pendientes.',
        status_drills_fallback: ' Motivo: {fallback}.',
        status_drills_cleanup: ' Se limpiaron automáticamente {count} drills obsoletos.',
        status_drills_rotated: ' Se reemplazaron {count} drills pendientes más antiguos para hacer espacio.',
        status_no_weak_skills: 'No se encontraron habilidades débiles',
        status_drills_cooldown: 'Espera {seconds}s antes de volver a rellenar.',
        status_fallback_queue_full: 'la cola ya está llena',
        status_fallback_queue_target_met: 'la cola ya alcanzó el objetivo',
        status_fallback_cooldown: 'cooldown activo',
        status_fallback_no_weak_skills: 'no se detectaron habilidades débiles',
        status_fallback_missing_api_key: 'no hay clave de modelo configurada; se usaron drills de plantilla',
        status_fallback_history_low_ratings: 'se usó historial de baja calificación como respaldo',
        status_fallback_history_topics: 'se usó historial por temas como respaldo',
        status_fallback_no_history: 'no hay historial disponible para respaldo',
        status_agent_saved: '✅ ¡Configuración guardada!',
        tools_heading: '🧰 Herramientas',
        tools_hint: 'Utilidades de mantenimiento manual.',
        streak_repair_date_label: 'Fecha para marcar activa (YYYY-MM-DD)',
        streak_repair_hint: 'Úsalo cuando se perdió un día de racha por falta de registro.',
        streak_repair_button: 'Reparar día de racha',
        status_streak_invalid_date: 'Fecha no válida. Usa YYYY-MM-DD.',
        status_streak_repair_saved: '✅ Actividad de racha registrada para {date}.',
        status_streak_repair_exists: 'ℹ️ {date} ya existe en tu registro de racha.'
    });

    I18N['es-ES'] = { ...esPack };

    I18N['tr-TR'] = createLocalePack({
        page_title: 'LeetCode EasyRepeat - AI Kurulumu',
        hero_title: 'LeetCode EasyRepeat',
        hero_subtitle: 'AI Kurulumu',
        language_label: 'Dil',
        hero_note: 'Yerel veya bulut AI sağlayıcılarını yapılandırın ve bağlantıyı doğrulayın.',
        ai_gate_heading: 'AI analizini etkinleştir',
        ai_gate_hint: 'Bunu açarak AI destekli hata analizi ve nöral tutma özelliklerini kullanın.',
        ai_gate_enable_title: 'AI analizini etkinleştir',
        ai_gate_enable_subtitle: 'Hata analizi, model kurulumu, gece özeti ve drill üretimini açar.',
        ai_gate_disable_title: 'AI analizini devre dışı bırak',
        ai_gate_disable_subtitle: 'AI kurulumu ve nöral modülleri gizler.',
        ai_gate_features_title: 'Etkin olduğunda kullanılabilen AI özellikleri:',
        ai_feature_item_1: 'Başarısız gönderimlerden sonra otomatik yanlış cevap analizi.',
        ai_feature_item_2: 'Yerel/Bulut model yapılandırması ve bağlantı testi.',
        ai_feature_item_3: 'Backfill, gece özeti ve zayıf beceri drill üretimi.',
        ai_feature_item_4: 'Ajan zamanlaması ve hata ayıklama ayarları.',
        ai_configuration_heading: 'AI Yapılandırması',
        active_model_label: 'Etkin model (önce seçin)',
        active_model_hint: 'Model seçenekleri seçilen moda göre (Yerel / Bulut) otomatik değişir.',
        choose_intelligence_source_heading: 'Zeka kaynağını seç',
        local_card_title: 'Yerel (Özel)',
        local_card_subtitle: 'Özel ve çevrimdışı, ancak akıl yürütme güvenilirliği daha düşüktür.',
        cloud_card_title: 'Bulut API',
        cloud_card_subtitle: 'Daha güçlü mantık, genelde ücretli, API anahtarı gerekir.',
        cloud_access_keys_heading: 'Bulut erişim anahtarları',
        cloud_key_help_link: 'API anahtarlarını nasıl alacağınızı bilmiyor musunuz? Buraya tıklayın.',
        cloud_local_endpoint_note: 'Cloud modunda Local Endpoint kullanılmaz.',
        local_setup_heading: 'Yerel LLM kurulumu',
        local_setup_hint: 'Yerel modelleri çalıştırmak için Ollama veya LM Studio kullanın.',
        local_quality_warning_strong: 'Kalite uyarısı:',
        local_quality_warning_rest: 'Yerel modeller analiz kalitesini ciddi şekilde düşürebilir.',
        local_warning_item_1: 'Karmaşık LeetCode doğruluğu ve sınır durumlarını yanlış değerlendirebilir.',
        local_warning_item_2: 'Gece özeti notları genel, eksik veya tutarsız olabilir.',
        local_warning_item_3: 'Yüksek güvenli puanlama ve kaliteli notlar için bulut modellerini tercih edin.',
        local_endpoint_hint_html: 'Bu otomatik keşfedilmez. Sadece Local modunda kullanılır ve yerel model sunucunuza yönlendirir (varsayılan <code>http://127.0.0.1:11434</code>).',
        test_connection_button: 'Bağlantıyı test et',
        quick_setup_heading: 'Hızlı kurulum kılavuzu',
        quick_setup_step_1: 'Yerel model servisini kurun.',
        quick_setup_step_2: 'Servisi başlatın ve çalışır tutun.',
        quick_setup_step_3: 'Yukarıya endpoint yazın ve "Bağlantıyı test et"e tıklayın.',
        ollama_example_heading: 'Ollama (Örnek)',
        lm_studio_heading: 'LM Studio (OpenAI Uyumlu)',
        troubleshooting_heading: 'Sorun giderme',
        troubleshooting_item_1: 'Ağ hatası görürseniz genelde yerel servis çalışmıyordur.',
        troubleshooting_item_2: 'CORS hatası görürseniz yerel serviste CORS etkinleştirin.',
        save_all_settings_button: 'Tüm ayarları kaydet',
        neural_retention_heading: '🧠 Nöral tutma ajanı',
        neural_retention_hint: 'Test için özet ve drill üretimini elle tetikleyin.',
        backfill_button: '📚 Geçmişten beceri profilini yeniden oluştur (tek sefer)',
        run_digest_button: '⚡ Bugünü analiz et ve zayıf becerileri güncelle',
        generate_drills_button: '🎯 Drill kuyruğunu doldur (zayıf becerilere göre)',
        neural_note_backfill_html: '• <b>Backfill</b>: tüm geçmişi tarayıp Skill DNAyı yeniden oluştur',
        neural_note_nightly_html: '• <b>Bugün analizi</b>: sadece bugünün verisini analiz edip zayıfları güncelle',
        neural_note_generate_html: '• <b>Kuyruk doldurma</b>: bekleyen drillleri hedef sınıra kadar doldur',
        neural_note_generate_cap_html: '• <b>Sınır</b>: zayıf beceri başına en fazla 9 drill (tip başına en fazla 3)',
        agent_settings_heading: '⚙️ Ajan ayarları',
        digest_time_label: 'Gece özeti saati:',
        pattern_threshold_label: 'Hata örüntüsü eşiği:',
        pattern_threshold_hint: 'Bir örüntüyü etkinleştirmek için gereken hata sayısı',
        debug_logs_label: 'Ayrıntılı debug logları:',
        debug_logs_hint: 'Arka plan debug loglarını etkinleştir',
        save_agent_settings_button: '💾 Ajan ayarlarını kaydet',
        model_group_local: 'Yerel (Ollama)',
        status_ai_gate_enabled: 'AI analizi etkin. AI kurulumu ve nöral modüller artık kullanılabilir.',
        status_ai_gate_disabled: 'AI analizi devre dışı. AI kurulumu ve nöral modüller gizli.',
        status_settings_saved: 'Ayarlar kaydedildi!',
        status_testing: '{url} test ediliyor...',
        status_test_success: 'Başarılı! {count} model bulundu.',
        status_http_error: 'Hata: HTTP {status}',
        status_connection_failed: 'Bağlantı başarısız: {message}',
        status_processing_history: 'Tüm geçmiş işleniyor...',
        status_backfill_success: '✅ {count} problem işlendi, {skills} beceri güncellendi{entries}{source}',
        status_backfill_source: ' (kaynak: {source})',
        status_backfill_entries: ', {entries} olay',
        status_no_history: 'Geçmiş bulunamadı',
        status_run_digest: 'Özet çalıştırılıyor...',
        status_digest_complete_detailed: '✅ Özet {time} itibarıyla tamamlandı! {items} kayıt işlendi, {skills} beceri güncellendi.',
        status_digest_complete: '✅ Özet tamamlandı!',
        status_no_data: 'İşlenecek veri yok',
        status_generating_drills: 'Drill kuyruğu dolduruluyor...',
        status_drills_generated: '✅ +{count} eklendi. Kuyruk şimdi {pending}/{target} beklemede.{rotated}{fallback}',
        status_drills_queue_full: '✅ Kuyruk dolu: {pending}/{target} beklemede. Doldurmadan önce birkaç drill bitirin.{cleanup}',
        status_drills_target_met: '✅ Kuyruk hedefte: {pending}/{target} beklemede.{cleanup}',
        status_drills_queue_snapshot: 'Kuyruk durumu: {pending}/{target} beklemede.',
        status_drills_fallback: ' Neden: {fallback}.',
        status_drills_cleanup: ' {count} eski drill otomatik temizlendi.',
        status_drills_rotated: ' Yer açmak için en eski {count} bekleyen drill değiştirildi.',
        status_no_weak_skills: 'Zayıf beceri bulunamadı',
        status_drills_cooldown: 'Tekrar doldurmadan önce {seconds}s bekleyin.',
        status_fallback_queue_full: 'kuyruk zaten dolu',
        status_fallback_queue_target_met: 'kuyruk zaten hedefte',
        status_fallback_cooldown: 'bekleme süresi aktif',
        status_fallback_no_weak_skills: 'zayıf beceri tespit edilmedi',
        status_fallback_missing_api_key: 'model anahtarı yok; şablon drill kullanıldı',
        status_fallback_history_low_ratings: 'düşük puanlı geçmiş yedek olarak kullanıldı',
        status_fallback_history_topics: 'konu geçmişi yedek olarak kullanıldı',
        status_fallback_no_history: 'yedek için geçmiş yok',
        status_agent_saved: '✅ Ayarlar kaydedildi!',
        tools_heading: '🧰 Araçlar',
        tools_hint: 'Elle bakım için yardımcı araçlar.',
        streak_repair_date_label: 'Aktif işaretlenecek tarih (YYYY-MM-DD)',
        streak_repair_hint: 'Etkinlik kaydedilmediği için seri günü kaçırıldığında kullanın.',
        streak_repair_button: 'Seri gününü onar',
        status_streak_invalid_date: 'Geçersiz tarih. YYYY-MM-DD kullanın.',
        status_streak_repair_saved: '✅ {date} için seri etkinliği kaydedildi.',
        status_streak_repair_exists: 'ℹ️ {date} zaten seri kaydınızda mevcut.'
    });

    let currentLanguage = DEFAULTS.uiLanguage;
    let latestDrillGenerationState = null;
    const DRILL_STATUS_PRESERVE_MS = 15000;

    const els = {};
    const statusTimers = new WeakMap();

    function getEl(id) {
        return document.getElementById(id);
    }

    function normalizeLanguage(languageCode) {
        if (typeof languageCode !== 'string' || !languageCode) {
            return DEFAULTS.uiLanguage;
        }
        if (SUPPORTED_LANGUAGES.has(languageCode)) {
            return languageCode;
        }
        if (languageCode.startsWith('zh')) {
            return 'zh';
        }
        if (languageCode.startsWith('en')) {
            return 'en';
        }
        if (languageCode.startsWith('es')) {
            return 'es-ES';
        }
        return DEFAULTS.uiLanguage;
    }

    function getLocaleTag(languageCode) {
        if (languageCode === 'zh') return 'zh-CN';
        if (languageCode === 'en') return 'en-US';
        return languageCode || 'en-US';
    }

    function interpolate(template, values = {}) {
        return String(template).replace(/\{(\w+)\}/g, (match, key) => {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
        });
    }

    function t(key, values = {}) {
        const table = I18N[currentLanguage] || I18N.en;
        const fallback = I18N.en || {};
        const template = table[key] ?? fallback[key] ?? key;
        return interpolate(template, values);
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function formatDateTime(value) {
        if (!value) return '-';

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat(getLocaleTag(currentLanguage), {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function normalizeBackupMeta(rawMeta) {
        return {
            ...BACKUP_META_DEFAULT,
            ...(isPlainObject(rawMeta) ? rawMeta : {})
        };
    }

    function summarizeStorageSnapshot(storageData = {}) {
        const data = isPlainObject(storageData) ? storageData : {};
        return {
            totalKeys: Object.keys(data).length,
            problemCount: isPlainObject(data.problems) ? Object.keys(data.problems).length : 0,
            activityDays: Array.isArray(data.activityLog) ? data.activityLog.length : 0
        };
    }

    function buildBackupFileName(exportedAt) {
        const safeIso = new Date(exportedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
        return `${BACKUP_FILE_PREFIX}-${safeIso}.json`;
    }

    function buildBackupPayload(storageData = {}, indexedDBData = null) {
        const exportedAt = new Date().toISOString();
        const data = isPlainObject(storageData) ? storageData : {};

        const payload = {
            backupSchemaVersion: BACKUP_SCHEMA_VERSION,
            storageArea: 'chrome.storage.local',
            exportedAt,
            extensionVersion: chrome.runtime?.getManifest?.().version || '',
            counts: summarizeStorageSnapshot(data),
            data
        };

        if (indexedDBData) {
            payload.indexedDBData = indexedDBData;
        }

        return payload;
    }

    function extractBackupData(parsed) {
        // v2 with indexedDBData
        if (isPlainObject(parsed) && isPlainObject(parsed.data) && isPlainObject(parsed.indexedDBData)) {
            return {
                storageData: parsed.data,
                indexedDBData: parsed.indexedDBData,
                exportedAt: parsed.exportedAt || ''
            };
        }

        // v1 envelope (data but no indexedDBData)
        if (isPlainObject(parsed) && isPlainObject(parsed.data)) {
            return {
                storageData: parsed.data,
                indexedDBData: null,
                exportedAt: parsed.exportedAt || ''
            };
        }

        // Raw object (no envelope)
        if (isPlainObject(parsed)) {
            return {
                storageData: parsed,
                indexedDBData: null,
                exportedAt: ''
            };
        }

        throw new Error(t('status_backup_invalid'));
    }

    function renderBackupMeta(meta) {
        if (!els.backupMeta) return;

        const normalized = normalizeBackupMeta(meta);
        const lines = [];

        if (normalized.lastBackupAt) {
            lines.push(t('backup_meta_last_backup', {
                date: formatDateTime(normalized.lastBackupAt),
                file: normalized.lastBackupFileName || '-',
                problems: normalized.lastBackupProblemCount || 0,
                keys: normalized.lastBackupKeyCount || 0
            }));
        }

        if (normalized.lastRestoreAt) {
            const exported = normalized.lastRestoredExportedAt
                ? t('backup_meta_source_exported_at', {
                    date: formatDateTime(normalized.lastRestoredExportedAt)
                })
                : '';

            lines.push(t('backup_meta_last_restore', {
                date: formatDateTime(normalized.lastRestoreAt),
                file: normalized.lastRestoreFileName || '-',
                problems: normalized.lastRestoreProblemCount || 0,
                keys: normalized.lastRestoreKeyCount || 0,
                exported
            }));
        }

        els.backupMeta.textContent = lines.length > 0 ? lines.join('\n') : t('backup_meta_empty');
    }

    function downloadJsonFile(fileName, text) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Use chrome.downloads with saveAs dialog if available
        if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
            chrome.downloads.download({
                url: url,
                filename: fileName,
                saveAs: true
            }, () => {
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            return;
        }

        // Fallback: <a> tag download (goes to default Downloads folder)
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
            URL.revokeObjectURL(url);
            anchor.remove();
        }, 0);
    }

    async function saveBackupMeta(patch) {
        const result = await chrome.storage.local.get({ [BACKUP_METADATA_KEY]: BACKUP_META_DEFAULT });
        const nextMeta = {
            ...normalizeBackupMeta(result[BACKUP_METADATA_KEY]),
            ...(isPlainObject(patch) ? patch : {})
        };

        await chrome.storage.local.set({ [BACKUP_METADATA_KEY]: nextMeta });
        renderBackupMeta(nextMeta);
        return nextMeta;
    }

    const DRILL_QUEUE_DEFAULT_TARGET = 12;

    function formatDrillFallback(fallbackCode) {
        if (!fallbackCode) return '';
        const reasonKey = {
            queue_full: 'status_fallback_queue_full',
            queue_target_met: 'status_fallback_queue_target_met',
            cooldown: 'status_fallback_cooldown',
            no_weak_skills: 'status_fallback_no_weak_skills',
            missing_api_key: 'status_fallback_missing_api_key',
            history_low_ratings: 'status_fallback_history_low_ratings',
            history_topics: 'status_fallback_history_topics',
            no_history: 'status_fallback_no_history'
        }[fallbackCode];

        return reasonKey ? t(reasonKey) : fallbackCode;
    }

    function buildDrillStatusMessage(payload = {}) {
        const pending = payload.pendingCount || 0;
        const target = payload.targetPending || DRILL_QUEUE_DEFAULT_TARGET;
        const fallbackCode = payload.fallback || '';
        const cleanupCount = payload.queueCleanupRemoved || 0;
        const rotatedCount = payload.queueRotatedOut || 0;
        const cleanup = cleanupCount > 0
            ? t('status_drills_cleanup', { count: cleanupCount })
            : '';
        const rotated = rotatedCount > 0
            ? t('status_drills_rotated', { count: rotatedCount })
            : '';

        if (fallbackCode === 'queue_full') {
            return t('status_drills_queue_full', { pending, target, cleanup });
        }

        if (fallbackCode === 'queue_target_met') {
            return t('status_drills_target_met', { pending, target, cleanup });
        }

        const fallbackReason = fallbackCode === 'queue_rotated' ? '' : formatDrillFallback(payload.fallback);
        const fallback = fallbackReason
            ? t('status_drills_fallback', { fallback: fallbackReason })
            : '';

        return t('status_drills_generated', {
            count: payload.count || 0,
            pending,
            target,
            rotated,
            fallback
        });
    }

    function shouldStickyDrillStatus(payload = {}) {
        const count = Number(payload.count || 0);
        const fallbackCode = payload.fallback || '';
        if (fallbackCode === 'queue_full' || fallbackCode === 'queue_target_met') return true;
        if (count <= 0) return false;
        return true;
    }

    function getDrillStatusTimestamp(status = {}) {
        const candidates = [
            Number(status._renderedAt || 0),
            Number(status.completedAt || 0),
            Number(status.startedAt || 0)
        ];

        for (const candidate of candidates) {
            if (Number.isFinite(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }

    function shouldPreserveDrillStatus(status = {}) {
        if (!status || !status.status) return false;
        if (status.status === 'snapshot') return false;

        const timestamp = getDrillStatusTimestamp(status);
        if (timestamp > 0 && (Date.now() - timestamp) > DRILL_STATUS_PRESERVE_MS) {
            return false;
        }

        if (status.status === 'generating') return true;
        if (status.status === 'cooldown' || status.status === 'error') return true;
        if (status.status === 'complete' && shouldStickyDrillStatus(status)) return true;
        return false;
    }

    function renderDrillGenerationStatus(status, drillsStatusEl, triggerBtn) {
        if (triggerBtn) {
            triggerBtn.disabled = status?.status === 'generating';
        }

        if (!drillsStatusEl || !status || !status.status) return;
        latestDrillGenerationState = {
            ...status,
            _renderedAt: Date.now()
        };

        if (status.status === 'generating') {
            showStatus(drillsStatusEl, t('status_generating_drills'), 'loading');
            return;
        }

        if (status.status === 'snapshot') {
            showStatus(drillsStatusEl, t('status_drills_queue_snapshot', {
                pending: status.pendingCount || 0,
                target: status.targetPending || DRILL_QUEUE_DEFAULT_TARGET
            }), 'ok', { sticky: true });
            return;
        }

        if (status.status === 'cooldown') {
            showStatus(drillsStatusEl, t('status_warning_prefix') + t('status_drills_cooldown', {
                seconds: status.waitSeconds || 0
            }), 'error', { sticky: true });
            return;
        }

        if (status.status === 'complete') {
            showStatus(
                drillsStatusEl,
                buildDrillStatusMessage(status),
                'ok',
                { sticky: shouldStickyDrillStatus(status) }
            );
            return;
        }

        if (status.status === 'error') {
            showStatus(
                drillsStatusEl,
                t('status_error_prefix') + (status.error || t('status_no_weak_skills')),
                'error',
                { sticky: true }
            );
        }
    }

    async function fetchDrillQueueStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getDrillQueueStatus' });
            if (!response || !response.success) return null;
            return response;
        } catch (e) {
            return null;
        }
    }

    function applyTranslations() {
        document.documentElement.lang = getLocaleTag(currentLanguage);

        document.querySelectorAll('[data-i18n]').forEach(node => {
            if (node.dataset.i18nDefault === undefined) {
                node.dataset.i18nDefault = node.textContent;
            }
            const key = node.dataset.i18n;
            const translated = I18N[currentLanguage]?.[key];
            node.textContent = translated ?? node.dataset.i18nDefault;
        });

        document.querySelectorAll('[data-i18n-html]').forEach(node => {
            if (node.dataset.i18nDefaultHtml === undefined) {
                node.dataset.i18nDefaultHtml = node.innerHTML;
            }
            const key = node.dataset.i18nHtml;
            const translated = I18N[currentLanguage]?.[key];
            node.innerHTML = translated ?? node.dataset.i18nDefaultHtml;
        });
    }

    async function populateModelSelect(mode, preferredModelId = '') {
        const select = els.modelSelect;
        if (!select) return;
        const currentSelected = preferredModelId || select.value;
        select.innerHTML = '';

        const createGroup = (label, models) => {
            const group = document.createElement('optgroup');
            group.label = label;
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                group.appendChild(option);
            });
            select.appendChild(group);
        };

        if (mode === 'local') {
            // Fetch dynamically if possible
            try {
                // Ensure the endpoint is saved before fetching if we are within the options page context
                if (els.localEndpoint) {
                    const endpoint = normalizeEndpoint(els.localEndpoint.value);
                    await chrome.storage.local.set({ localEndpoint: endpoint });
                }

                const response = await chrome.runtime.sendMessage({ action: 'listModels' });
                if (response && response.success && response.models && response.models.length > 0) {
                    const dynamicModels = response.models.map(name => ({ id: name, name: name, provider: 'local' }));
                    createGroup(t('model_group_local'), dynamicModels);
                } else {
                    createGroup(t('model_group_local'), MODELS.local);
                }
            } catch (e) {
                console.warn('[Options] Failed to fetch dynamic models:', e);
                createGroup(t('model_group_local'), MODELS.local);
            }
        } else {
            createGroup(t('model_group_google'), MODELS.gemini);
            createGroup(t('model_group_openai'), MODELS.openai);
            createGroup(t('model_group_anthropic'), MODELS.anthropic);
        }

        const values = Array.from(select.options).map(option => option.value);
        if (currentSelected && values.includes(currentSelected)) {
            select.value = currentSelected;
        } else if (values.length > 0) {
            select.value = values[0];
        }
    }

    async function setModeUI(mode, preferredModelId = '') {
        if (els.sectionLocal) {
            els.sectionLocal.style.display = mode === 'local' ? 'block' : 'none';
        }
        if (els.sectionCloud) {
            els.sectionCloud.style.display = mode === 'cloud' ? 'block' : 'none';
        }
        await populateModelSelect(mode, preferredModelId);
    }

    function setAiFeatureVisibility(enabled) {
        const display = enabled ? 'block' : 'none';
        if (els.aiConfigCard) els.aiConfigCard.style.display = display;
        if (els.neuralRetentionCard) els.neuralRetentionCard.style.display = display;
        if (els.agentSettingsCard) els.agentSettingsCard.style.display = display;
    }

    async function applyAiAnalysisSetting(enabled, options = {}) {
        const normalized = Boolean(enabled);
        if (els.aiAnalysisEnabled) els.aiAnalysisEnabled.checked = normalized;
        if (els.aiAnalysisDisabled) els.aiAnalysisDisabled.checked = !normalized;
        setAiFeatureVisibility(normalized);

        if (options.persist) {
            const payload = { aiAnalysisEnabled: normalized };
            if (!normalized) {
                payload.agentEnabled = false;
            }
            await chrome.storage.local.set(payload);
        }

        if (options.notify) {
            showStatus(
                els.aiGateStatus,
                normalized ? t('status_ai_gate_enabled') : t('status_ai_gate_disabled'),
                'ok',
                { sticky: true }
            );
        }
    }

    async function loadSettings() {
        const settings = await chrome.storage.local.get({
            ...DEFAULTS,
            [BACKUP_METADATA_KEY]: BACKUP_META_DEFAULT
        });

        currentLanguage = normalizeLanguage(settings.uiLanguage);
        if (els.langSelect) {
            els.langSelect.value = currentLanguage;
        }
        applyTranslations();
        renderBackupMeta(settings[BACKUP_METADATA_KEY]);
        await applyAiAnalysisSetting(settings.aiAnalysisEnabled !== false, { notify: true });

        const mode = settings.aiProvider === 'cloud' ? 'cloud' : 'local';
        if (mode === 'local') {
            els.modeLocal.checked = true;
        } else {
            els.modeCloud.checked = true;
        }
        await setModeUI(mode, settings.selectedModelId || '');

        if (settings.keys) {
            els.keyGoogle.value = settings.keys.google || '';
            els.keyOpenai.value = settings.keys.openai || '';
            els.keyAnthropic.value = settings.keys.anthropic || '';
        }

        els.localEndpoint.value = settings.localEndpoint || DEFAULTS.localEndpoint;
    }

    async function saveSettings() {
        const mode = els.modeLocal.checked ? 'local' : 'cloud';

        const payload = {
            aiProvider: mode,
            keys: {
                google: els.keyGoogle.value.trim(),
                openai: els.keyOpenai.value.trim(),
                anthropic: els.keyAnthropic.value.trim()
            },
            aiAnalysisEnabled: Boolean(els.aiAnalysisEnabled?.checked),
            localEndpoint: els.localEndpoint.value.trim(),
            selectedModelId: els.modelSelect.value,
            uiLanguage: currentLanguage
        };

        await chrome.storage.local.set(payload);
        showStatus(els.saveStatus, t('status_settings_saved'), 'ok');
    }

    function showStatus(el, text, type, options = {}) {
        if (!el) return;

        const existing = statusTimers.get(el);
        if (existing) {
            clearTimeout(existing);
            statusTimers.delete(el);
        }

        el.textContent = text;
        el.className = 'status-text ' + (type || '');

        if (options.sticky || type === 'loading') return;

        const timeout = type === 'error' ? 8000 : 2000;
        const timerId = setTimeout(() => {
            el.textContent = '';
            el.className = 'status-text';
            statusTimers.delete(el);
        }, timeout);

        statusTimers.set(el, timerId);
    }

    function getYesterdayDateString() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function isValidDateString(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return false;
        const normalized = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        return normalized === value;
    }

    async function repairStreakForDate(dateValue, statusEl) {
        if (!isValidDateString(dateValue)) {
            showStatus(statusEl, t('status_streak_invalid_date'), 'error', { sticky: true });
            return;
        }

        const { activityLog } = await chrome.storage.local.get({ activityLog: [] });
        const log = Array.isArray(activityLog) ? [...activityLog] : [];

        if (log.includes(dateValue)) {
            showStatus(statusEl, t('status_streak_repair_exists', { date: dateValue }), 'ok', { sticky: true });
            return;
        }

        log.push(dateValue);
        log.sort();
        await chrome.storage.local.set({ activityLog: log });
        showStatus(statusEl, t('status_streak_repair_saved', { date: dateValue }), 'ok', { sticky: true });
    }

    /**
     * Read all rows from an IndexedDB/Dexie store.
     * Returns [] if Dexie or the store is unavailable.
     */
    async function readIDBStore(dbName, storesDef, tableName) {
        try {
            const DexieClass = (typeof Dexie !== 'undefined' && Dexie) ||
                (typeof window !== 'undefined' && window.Dexie) ||
                (typeof self !== 'undefined' && self.Dexie);
            if (!DexieClass) return [];
            const db = new DexieClass(dbName);
            db.version(1).stores(storesDef);
            await db.open();
            return await db[tableName].toArray();
        } catch (e) {
            console.warn(`[Backup] Could not read ${dbName}.${tableName}:`, e);
            return [];
        }
    }

    /**
     * Clear and bulk-write rows into an IndexedDB/Dexie store.
     */
    async function writeIDBStore(dbName, storesDef, tableName, rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;
        try {
            const DexieClass = (typeof Dexie !== 'undefined' && Dexie) ||
                (typeof window !== 'undefined' && window.Dexie) ||
                (typeof self !== 'undefined' && self.Dexie);
            if (!DexieClass) return;
            const db = new DexieClass(dbName);
            db.version(1).stores(storesDef);
            await db.open();
            await db[tableName].clear();
            await db[tableName].bulkAdd(rows);
        } catch (e) {
            console.warn(`[Backup] Could not write ${dbName}.${tableName}:`, e);
        }
    }

    // IndexedDB schema definitions (must match the real stores)
    const IDB_SCHEMAS = {
        DrillsDB: { drills: 'id, type, skillId, status, createdAt, difficulty' },
        InsightsDB: { insights: 'id, *skillIds, createdAt, lastSeenAt, weight, frequency' },
        NeuralRetentionDB: {
            submissionLog: '++id, sessionId, problemSlug, timestamp, result, submissionId',
            attemptCounter: '[sessionId+problemSlug], count'
        }
    };

    async function exportBackupSnapshot() {
        showStatus(els.backupStatus, t('status_backup_exporting'), 'loading');

        const storageData = await chrome.storage.local.get(null);

        // Strip sensitive data — never export API keys
        const SENSITIVE_KEYS = ['keys', 'geminiApiKey'];
        for (const key of SENSITIVE_KEYS) {
            delete storageData[key];
        }

        // Read IndexedDB stores
        const drills = await readIDBStore('DrillsDB', IDB_SCHEMAS.DrillsDB, 'drills');
        const insights = await readIDBStore('InsightsDB', IDB_SCHEMAS.InsightsDB, 'insights');
        const submissionLog = await readIDBStore(
            'NeuralRetentionDB', IDB_SCHEMAS.NeuralRetentionDB, 'submissionLog'
        );

        const indexedDBData = { drills, insights, submissionLog };
        const payload = buildBackupPayload(storageData, indexedDBData);
        const fileName = buildBackupFileName(payload.exportedAt);
        const jsonText = JSON.stringify(payload, null, 2);

        downloadJsonFile(fileName, jsonText);
        await saveBackupMeta({
            lastBackupAt: payload.exportedAt,
            lastBackupFileName: fileName,
            lastBackupProblemCount: payload.counts.problemCount,
            lastBackupKeyCount: payload.counts.totalKeys
        });

        showStatus(els.backupStatus, t('status_backup_exported', {
            file: fileName,
            problems: payload.counts.problemCount,
            keys: payload.counts.totalKeys
        }), 'ok', { sticky: true });
    }

    async function restoreBackupFromFile(file) {
        if (!file) return;

        showStatus(els.backupStatus, t('status_backup_restoring'), 'loading');

        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch (e) {
            throw new Error(t('status_backup_parse_failed'));
        }

        const { storageData, indexedDBData, exportedAt } = extractBackupData(parsed);
        const summary = summarizeStorageSnapshot(storageData);
        const shouldRestore = window.confirm(t('confirm_backup_restore'));

        if (!shouldRestore) {
            showStatus(els.backupStatus, t('status_backup_restore_cancelled'), '', { sticky: false });
            return;
        }

        // 1. Restore chrome.storage.local
        await chrome.storage.local.clear();

        if (Object.keys(storageData).length > 0) {
            await chrome.storage.local.set(storageData);
        }

        // 2. Restore IndexedDB stores (only if backup includes them — v2+)
        if (indexedDBData) {
            const drills = Array.isArray(indexedDBData.drills) ? indexedDBData.drills : [];
            const insights = Array.isArray(indexedDBData.insights) ? indexedDBData.insights : [];
            const submissionLog = Array.isArray(indexedDBData.submissionLog) ? indexedDBData.submissionLog : [];

            if (drills.length > 0) {
                await writeIDBStore('DrillsDB', IDB_SCHEMAS.DrillsDB, 'drills', drills);
            }
            if (insights.length > 0) {
                await writeIDBStore('InsightsDB', IDB_SCHEMAS.InsightsDB, 'insights', insights);
            }
            if (submissionLog.length > 0) {
                await writeIDBStore(
                    'NeuralRetentionDB', IDB_SCHEMAS.NeuralRetentionDB, 'submissionLog', submissionLog
                );
            }
        }

        await saveBackupMeta({
            ...normalizeBackupMeta(storageData[BACKUP_METADATA_KEY]),
            lastRestoreAt: new Date().toISOString(),
            lastRestoreFileName: file.name,
            lastRestoreProblemCount: summary.problemCount,
            lastRestoreKeyCount: summary.totalKeys,
            lastRestoredExportedAt: exportedAt || ''
        });

        await loadSettings();
        showStatus(els.backupStatus, t('status_backup_restored', {
            file: file.name,
            problems: summary.problemCount,
            keys: summary.totalKeys
        }), 'ok', { sticky: true });
    }

    function promptBackupRestore() {
        if (!els.backupFileInput) return;
        els.backupFileInput.value = '';
        els.backupFileInput.click();
    }

    function normalizeEndpoint(input) {
        let url = (input || '').trim();

        if (!url) return DEFAULTS.localEndpoint;

        url = url.replace(/\/$/, '');
        if (!/^https?:\/\//i.test(url)) {
            url = 'http://' + url;
        }
        return url;
    }

    async function testLocalConnection() {
        const endpoint = normalizeEndpoint(els.localEndpoint.value);
        const url = `${endpoint}/api/tags`;
        showStatus(els.testStatus, t('status_testing', { url }), '');

        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const count = data.models ? data.models.length : 0;
                showStatus(els.testStatus, t('status_test_success', { count }), 'ok');

                // Auto-refresh model list after successful test
                await populateModelSelect('local');
            } else {
                showStatus(els.testStatus, t('status_http_error', { status: res.status }), 'error');
            }
        } catch (e) {
            showStatus(els.testStatus, t('status_connection_failed', { message: e.message }), 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        els.modeLocal = getEl('mode-local');
        els.modeCloud = getEl('mode-cloud');
        els.sectionLocal = getEl('section-local');
        els.sectionCloud = getEl('section-cloud');
        els.keyGoogle = getEl('key-google');
        els.keyOpenai = getEl('key-openai');
        els.keyAnthropic = getEl('key-anthropic');
        els.localEndpoint = getEl('local-endpoint');
        els.modelSelect = getEl('model-select');
        els.aiAnalysisEnabled = getEl('ai-analysis-enabled');
        els.aiAnalysisDisabled = getEl('ai-analysis-disabled');
        els.aiGateStatus = getEl('ai-gate-status');
        els.aiConfigCard = getEl('ai-config-card');

        els.saveBtn = getEl('save-settings');
        els.saveStatus = getEl('save-status');
        els.testBtn = getEl('test-local');
        els.testStatus = getEl('test-status');
        els.langSelect = getEl('lang-select');
        els.backupExportBtn = getEl('backup-export-btn');
        els.backupRestoreBtn = getEl('backup-restore-btn');
        els.backupStatus = getEl('backup-status');
        els.backupMeta = getEl('backup-meta');
        els.backupFileInput = getEl('backup-file-input');

        els.saveBtn.addEventListener('click', saveSettings);
        els.testBtn.addEventListener('click', testLocalConnection);
        els.backupExportBtn?.addEventListener('click', async () => {
            try {
                els.backupExportBtn.disabled = true;
                await exportBackupSnapshot();
            } catch (e) {
                showStatus(els.backupStatus, t('status_error_prefix') + e.message, 'error', { sticky: true });
            } finally {
                els.backupExportBtn.disabled = false;
            }
        });
        els.backupRestoreBtn?.addEventListener('click', promptBackupRestore);
        els.backupFileInput?.addEventListener('change', async (event) => {
            const file = event.target?.files?.[0];
            if (!file) return;

            try {
                els.backupRestoreBtn.disabled = true;
                await restoreBackupFromFile(file);
            } catch (e) {
                showStatus(els.backupStatus, t('status_error_prefix') + e.message, 'error', { sticky: true });
            } finally {
                els.backupRestoreBtn.disabled = false;
                if (els.backupFileInput) {
                    els.backupFileInput.value = '';
                }
            }
        });

        els.modeLocal.addEventListener('change', async () => await setModeUI('local'));
        els.modeCloud.addEventListener('change', async () => await setModeUI('cloud'));

        if (els.aiAnalysisEnabled) {
            els.aiAnalysisEnabled.addEventListener('change', async () => {
                if (!els.aiAnalysisEnabled.checked) return;
                await applyAiAnalysisSetting(true, { persist: true, notify: true });
            });
        }

        if (els.aiAnalysisDisabled) {
            els.aiAnalysisDisabled.addEventListener('change', async () => {
                if (!els.aiAnalysisDisabled.checked) return;
                await applyAiAnalysisSetting(false, { persist: true, notify: true });
            });
        }

        if (els.langSelect) {
            els.langSelect.addEventListener('change', async () => {
                currentLanguage = normalizeLanguage(els.langSelect.value);
                els.langSelect.value = currentLanguage;
                applyTranslations();
                const backupState = await chrome.storage.local.get({ [BACKUP_METADATA_KEY]: BACKUP_META_DEFAULT });
                renderBackupMeta(backupState[BACKUP_METADATA_KEY]);

                const mode = els.modeLocal.checked ? 'local' : 'cloud';
                const selectedModelId = els.modelSelect.value;
                await setModeUI(mode, selectedModelId);
                await applyAiAnalysisSetting(Boolean(els.aiAnalysisEnabled?.checked), { notify: true });

                await chrome.storage.local.set({ uiLanguage: currentLanguage });
            });
        }

        await loadSettings();

        const streakRepairDateInput = getEl('streak-repair-date');
        const streakRepairBtn = getEl('streak-repair-btn');
        const streakRepairStatus = getEl('streak-repair-status');

        if (streakRepairDateInput && !streakRepairDateInput.value) {
            streakRepairDateInput.value = getYesterdayDateString();
        }

        if (streakRepairBtn) {
            streakRepairBtn.addEventListener('click', async () => {
                const dateValue = (streakRepairDateInput?.value || '').trim();
                try {
                    streakRepairBtn.disabled = true;
                    await repairStreakForDate(dateValue, streakRepairStatus);
                } catch (e) {
                    showStatus(streakRepairStatus, t('status_error_prefix') + e.message, 'error', { sticky: true });
                } finally {
                    streakRepairBtn.disabled = false;
                }
            });
        }
    });
})();
