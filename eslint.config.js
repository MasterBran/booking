import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.app.json',
      },
    },
    rules: {
      // TypeScript相关规则 - 将any类型警告设置为warn级别
      '@typescript-eslint/no-explicit-any': 'warn',           // 禁止使用any类型
      '@typescript-eslint/no-used-vars': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',       // 禁止any类型赋值
      '@typescript-eslint/no-unsafe-call': 'warn',             // 禁止any类型调用
      '@typescript-eslint/no-unsafe-member-access': 'warn',    // 禁止any类型成员访问
      '@typescript-eslint/no-unsafe-return': 'warn',           // 禁止any类型返回
      '@typescript-eslint/no-unsafe-argument': 'warn',         // 禁止any类型参数
      '@typescript-eslint/explicit-module-boundary-types': 'warn', // 要求显式模块边界类型
    },
  },
])
