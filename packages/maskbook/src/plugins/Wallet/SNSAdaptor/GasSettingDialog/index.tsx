import type { FC } from 'react'
import { DialogContent } from '@material-ui/core'
import { WalletMessages } from '@masknet/plugin-wallet'
import { makeStyles } from '@masknet/theme'
import { useRemoteControlledDialog } from '@masknet/shared'
import { InjectedDialog } from '../../../../components/shared/InjectedDialog'
import { useI18N } from '../../../../utils'
import { GasSetting } from './GasSetting'

const useStyles = makeStyles()((theme) => ({
    content: {
        color: theme.palette.text.primary,
    },
}))

export const GasSettingDialog: FC = () => {
    const { t } = useI18N()
    const { classes } = useStyles()
    const { open, closeDialog } = useRemoteControlledDialog(WalletMessages.events.gasSettingDialogUpdated)
    return (
        <InjectedDialog title={t('popups_wallet_gas_fee_settings')} open={open} onClose={closeDialog}>
            <DialogContent className={classes.content}>
                <GasSetting />
            </DialogContent>
        </InjectedDialog>
    )
}
