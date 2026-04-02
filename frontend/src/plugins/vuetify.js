import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'

export default createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#7C4DFF',
          secondary: '#448AFF',
          accent: '#FF4081',
          success: '#4CAF50',
          warning: '#FF9800',
          error: '#FF5252',
          surface: '#1E1E2E',
          background: '#121220',
        },
      },
    },
  },
  defaults: {
    VCard: { elevation: 0 },
    VBtn: { variant: 'flat' },
  },
})
