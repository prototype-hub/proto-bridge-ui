export const usersLocales = {
  zh: {
    auth: {
      users: '用户管理',
      resetPassword: '重置密码',
    },
    system: {
      confirmPassword: '确认密码',
      passwordStrength: '密码强度',
    },
    identity: {
      userType: '用户类型',
      rolesLabel: '角色',
      organizationsLabel: '组织',
      positionsLabel: '职位',
      mobilePhone: '手机号',
      basicInfo: '基本信息',
      loginInfo: '登录信息',
      inherited: '所选职位关联的角色和组织将自动加入，继承项不可取消。',
      passwordRule: '密码须为 12 至 128 个字符，不能全部为空白',
      usernameRule: '用户名最多 64 个字符',
      usernameUnavailable: '用户名已存在或不可用，请更换用户名',
      emailRule: "请输入有效的电子邮箱，例如 name{'@'}example.com",
      requiredField: '请输入{field}',
      fieldMaxLength: '{field}最多 {max} 个字符',
      selectRole: '请至少选择一个角色',
    },
  },
  en: {
    auth: {
      users: 'Users',
      resetPassword: 'Reset password',
    },
    system: {
      confirmPassword: 'Confirm password',
      passwordStrength: 'Password strength',
    },
    identity: {
      userType: 'User type',
      rolesLabel: 'Roles',
      organizationsLabel: 'Organizations',
      positionsLabel: 'Positions',
      mobilePhone: 'Mobile phone',
      basicInfo: 'Basic information',
      loginInfo: 'Login information',
      inherited:
        'Roles and organizations inherited from selected positions are added automatically and cannot be removed.',
      passwordRule: 'Use 12–128 characters; the password cannot be entirely whitespace',
      usernameRule: 'Use up to 64 characters',
      usernameUnavailable: 'The username is already in use or unavailable; choose another username',
      emailRule: "Enter a valid email address, such as name{'@'}example.com",
      requiredField: 'Enter {field}',
      fieldMaxLength: '{field} must be at most {max} characters',
      selectRole: 'Select at least one role',
    },
  },
}
