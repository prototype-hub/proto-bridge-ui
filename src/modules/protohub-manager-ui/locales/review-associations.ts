export const reviewAssociationLocales = {
  zh: {
    associationSubmissionResult: '\u63d0\u4ea4\u7ed3\u679c',
    associationTitle: '访问者关联',
    associationBackThread: '返回反馈',
    associationSubtitle: '将线下已核实的访客与历史反馈关联，保留原作者记录。',
    associationScope: '授权范围',
    associationProjectVersion: '项目 / 版本',
    associationRevision: '固定修订',
    associationOriginalShare: '原分享',
    associationShareAvailable: '可用',
    associationShareUnavailable: '当前不可用',
    associationSource: '历史来源访客',
    associationCreate: '建立关联',
    associationRevoke: '撤销关联',
    associationCurrent: '当前关联',
    associationEmpty:
      '尚未关联。选择同项目已验证邮箱的访问者，为其授权查看和回复此来源的历史对客反馈。',
    associationHistory: '关联记录',
    associationHistoryEmpty: '暂无关联记录。',
    associationHistoryDetail: '关联记录详情',
    associationChooseTarget: '选择已验证访问者',
    associationTargetHelp: '仅可选择同项目已启用、邮箱已验证的访问者。未显示的访问者可翻页查找。',
    associationNoTargets: '暂无已验证访问者。请先通过既有分享身份流程完成邮箱验证，再返回刷新。',
    associationTargetDisabled: '已停用',
    associationTargetUnavailable: '访问者当前不可用',
    associationSelected: '已选择：',
    associationEvidence: '人工核实依据（必填）',
    associationEvidenceHelp:
      '填写线下核实的依据或记录编号，仅对有权管理人员可见。请勿填写密码、验证码等敏感信息。',
    associationRevokeReason: '撤销原因（必填）',
    associationGrantedBy: '授权记录',
    associationRevokedBy: '撤销记录',
    associationImpact: '确认影响范围',
    associationGrantImpact:
      '授权目标访问者读取并以其真实身份回复：同一原分享、同一固定修订内，此旧来源访客的所有历史对客反馈。不限于当前这一条反馈。',
    associationIdentityBoundary:
      '历史作者、姓名、公司和验证状态保持不变；新回复使用目标访问者的真实身份。草稿不迁移，原会话不恢复。回复已解决反馈会自动重开；关联不授予单独重开权限。',
    associationRevokeScope:
      '撤销后，目标访问者不能再通过此关联查看或回复上述历史反馈；已经保存的回复和历史审计记录保留。',
    associationConfirmed: '我已核实双方身份，并确认上述范围与影响',
    associationRevokeConfirm: '确认撤销此关联',
    associationRevokeImpact: '将撤销「{target}」对「{source}」历史反馈的关联访问权限。',
    associationRules: '查看授权规则',
    associationScopeRules:
      '关联仅在原分享与固定修订内有效，不授权其他分享、修订或内部讨论。原分享或目标访问者变更后，需先明确撤销旧关联，才能重新授权。',
    associationMustRevoke: '当前记录仍占用关联位置。请先撤销，再根据最新状态重新授权。',
    associationUnavailableHelp:
      '不会切换到其他分享。请通过现有分享管理流程处理原分享；已有失效关联仍可撤销。',
    associationStatus_active: '已生效',
    associationStatus_invalidated: '已失效',
    associationStatus_revoked: '已撤销',
    associationReason_SHARE_UNAVAILABLE: '原分享不可用，当前关联无法使用。',
    associationReason_SHARE_CHANGED: '原分享配置已变化，当前关联无法使用。',
    associationReason_TARGET_UNAVAILABLE: '目标访问者已停用或不可用。',
    associationReason_TARGET_CHANGED: '目标访问者配置已变化，当前关联无法使用。',
    associationReason_REVISION_UNAVAILABLE: '固定修订不可用。',
    associationReason_UNAVAILABLE: '当前授权范围不可用。',
    associationAccessChanged: '项目权限或来源反馈已不可用。请返回反馈并刷新权限。',
    associationLoadFailed: '未能加载关联信息，请重试。',
    associationTargetsFailed: '未能加载已验证访问者，请重试。',
    associationCreated: '关联请求已处理，以下显示最新授权状态。',
    associationRevoked: '撤销请求已处理，以下显示最新授权状态。',
    associationConflict: '配置或关联已变化，已刷新最新状态。请重新核实后确认，未自动重发。',
    associationWriteFailed: '请求未通过校验，未重新提交。请检查内容并重试。',
    associationUnknown:
      '提交结果尚未确认。请保留此页面，使用原请求重试确认结果；不要重复建立关联。',
    associationRetryExact: '用原请求确认结果',
    associationHistoricalAccess: '经授权的历史反馈',
    associationHistoricalHelp:
      '保留原作者记录。你可以使用当前身份回复；关联权限失效后将无法继续访问。',
  },
  en: {
    associationSubmissionResult: 'Submission result',
    associationTitle: 'Visitor association',
    associationBackThread: 'Back to feedback',
    associationSubtitle:
      'Link an offline-verified visitor to historical feedback while preserving its original authors.',
    associationScope: 'Authorization scope',
    associationProjectVersion: 'Project / version',
    associationRevision: 'Fixed revision',
    associationOriginalShare: 'Original share',
    associationShareAvailable: 'Available',
    associationShareUnavailable: 'Unavailable',
    associationSource: 'Historical source',
    associationCreate: 'Create association',
    associationRevoke: 'Revoke association',
    associationCurrent: 'Current association',
    associationEmpty:
      'No association yet. Select an existing verified-email visitor in this project to grant access to this source’s historical public feedback.',
    associationHistory: 'Association history',
    associationHistoryEmpty: 'No association records yet.',
    associationHistoryDetail: 'Association record',
    associationChooseTarget: 'Choose a verified visitor',
    associationTargetHelp:
      'Only enabled, email-verified visitors in this project can be selected. Browse additional pages to find a visitor.',
    associationNoTargets:
      'No verified visitors yet. Complete email verification through the existing share identity flow, then refresh here.',
    associationTargetDisabled: 'Disabled',
    associationTargetUnavailable: 'Visitor unavailable',
    associationSelected: 'Selected:',
    associationEvidence: 'Offline verification basis (required)',
    associationEvidenceHelp:
      'Record your verification basis or reference number. Only authorized managers can see it. Do not include passwords or verification codes.',
    associationRevokeReason: 'Revocation reason (required)',
    associationGrantedBy: 'Granted by',
    associationRevokedBy: 'Revoked by',
    associationImpact: 'Confirm the scope and effect',
    associationGrantImpact:
      'The selected visitor can read and reply with their actual identity to all historical public feedback from this source within this original share and fixed revision. This covers more than the selected thread.',
    associationIdentityBoundary:
      'Original authors, names, companies and verification levels remain unchanged. New replies use the target’s actual identity. Drafts are not moved and source sessions are not recovered. Replying to resolved feedback automatically reopens it; an association does not grant a separate reopen action.',
    associationRevokeScope:
      'Revoking removes this associated access to read and reply. Saved replies and historical audit records remain.',
    associationConfirmed: 'I verified both identities and confirm this scope and effect',
    associationRevokeConfirm: 'Confirm revocation',
    associationRevokeImpact:
      'Remove “{target}” from associated access to historical feedback by “{source}”.',
    associationRules: 'Authorization rules',
    associationScopeRules:
      'Access is limited to the original share and fixed revision. It does not cover other shares, revisions or internal notes. If the share or target changes, explicitly revoke the old association before granting another.',
    associationMustRevoke:
      'This record still occupies the association slot. Revoke it before granting new access based on current state.',
    associationUnavailableHelp:
      'Another share will not be substituted. Manage the original share through the existing sharing flow. Invalidated associations can still be revoked.',
    associationStatus_active: 'Active',
    associationStatus_invalidated: 'Invalidated',
    associationStatus_revoked: 'Revoked',
    associationReason_SHARE_UNAVAILABLE:
      'The original share is unavailable. Associated access cannot be used.',
    associationReason_SHARE_CHANGED:
      'The original share changed. Associated access cannot be used.',
    associationReason_TARGET_UNAVAILABLE: 'The target visitor is disabled or unavailable.',
    associationReason_TARGET_CHANGED:
      'The target visitor changed. Associated access cannot be used.',
    associationReason_REVISION_UNAVAILABLE: 'The fixed revision is unavailable.',
    associationReason_UNAVAILABLE: 'The authorization scope is unavailable.',
    associationAccessChanged:
      'Project access or the source feedback is unavailable. Return to feedback and refresh access.',
    associationLoadFailed: 'Could not load association details. Try again.',
    associationTargetsFailed: 'Could not load verified visitors. Try again.',
    associationCreated:
      'The association request was processed. The latest authorization state is shown below.',
    associationRevoked:
      'The revocation request was processed. The latest authorization state is shown below.',
    associationConflict:
      'The configuration or association changed. Current state was refreshed. Verify it again before confirming; nothing was resubmitted automatically.',
    associationWriteFailed:
      'The request did not pass validation and was not resubmitted. Check the details and try again.',
    associationUnknown:
      'The submission result is not confirmed. Keep this page open and retry the original request to confirm the result. Do not create a duplicate association.',
    associationRetryExact: 'Confirm original request',
    associationHistoricalAccess: 'Authorized historical feedback',
    associationHistoricalHelp:
      'Original authors are preserved. You may reply with your current identity. Access ends if the association becomes invalid.',
  },
}
