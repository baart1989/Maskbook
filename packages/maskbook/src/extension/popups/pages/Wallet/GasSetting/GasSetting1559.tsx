import { memo, useEffect, useMemo, useState } from 'react'
import { EthereumRpcType, formatWeiToGwei, useChainId, useNativeTokenDetailed } from '@masknet/web3-shared'
import { useAsync, useAsyncFn, useUpdateEffect } from 'react-use'
import { WalletRPC } from '../../../../../plugins/Wallet/messages'
import Services from '../../../../service'
import BigNumber from 'bignumber.js'
import { useI18N } from '../../../../../utils'
import { z as zod } from 'zod'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Typography } from '@material-ui/core'
import { StyledInput } from '../../../components/StyledInput'
import { LoadingButton } from '@material-ui/lab'
import { isEmpty } from 'lodash-es'
import { useUnconfirmedRequest } from '../hooks/useUnConfirmedRequest'
import { useNativeTokenPrice } from '../../../../../plugins/Wallet/hooks/useTokenPrice'
import { useStyles } from './useGasSettingStyles'

const HIGH_FEE_WARNING_MULTIPLIER = 1.5

interface Props {
    onConfirm?: () => void
}

export const GasSetting1559 = memo<Props>(({ onConfirm }) => {
    const { classes } = useStyles()
    const { t } = useI18N()
    const chainId = useChainId()
    const [selected, setOption] = useState<number | null>(null)
    const { value: nativeToken } = useNativeTokenDetailed()
    const nativeTokenPrice = useNativeTokenPrice(nativeToken?.chainId)

    const { value: gasNow } = useAsync(async () => {
        const { data } = await WalletRPC.getGasPriceDictFromDeBank(chainId)
        return {
            slow: formatWeiToGwei(data.slow.price).toString(),
            standard: formatWeiToGwei(data.normal.price).toString(),
            fast: formatWeiToGwei(data.fast.price).toString(),
        }
    }, [chainId])

    const { value } = useUnconfirmedRequest()

    const options = useMemo(
        () => [
            {
                title: t('popups_wallet_gas_fee_settings_low'),
                gasPrice: gasNow?.slow,
            },
            {
                title: t('popups_wallet_gas_fee_settings_medium'),
                gasPrice: gasNow?.standard,
            },
            {
                title: t('popups_wallet_gas_fee_settings_high'),
                gasPrice: gasNow?.fast,
            },
        ],
        [gasNow],
    )

    const gas = useMemo(() => {
        if (
            value &&
            (value?.computedPayload?.type === EthereumRpcType.SEND_ETHER ||
                value?.computedPayload?.type === EthereumRpcType.CONTRACT_INTERACTION)
        ) {
            return new BigNumber(value?.computedPayload?._tx.gas ?? 0, 16).toNumber()
        }
        return '0'
    }, [value])

    //#region Form field define schema
    const schema = useMemo(() => {
        return zod
            .object({
                gasLimit: zod
                    .string()
                    .min(1, t('wallet_transfer_error_gasLimit_absence'))
                    .refine(
                        (gasLimit) => new BigNumber(gasLimit).isGreaterThanOrEqualTo(gas),
                        `Gas limit must be at least ${gas}.`,
                    ),
                maxPriorityFeePerGas: zod
                    .string()
                    .min(1, t('wallet_transfer_error_maxPriority_fee_absence'))
                    .refine(
                        (value) => new BigNumber(value).isPositive(),
                        t('wallet_transfer_error_max_priority_gas_fee_positive'),
                    )
                    .refine((value) => {
                        return new BigNumber(value).isGreaterThanOrEqualTo(gasNow?.slow ?? 0)
                    }, t('wallet_transfer_error_max_priority_gas_fee_too_low'))
                    .refine(
                        (value) =>
                            new BigNumber(value).isLessThan(
                                new BigNumber(gasNow?.fast ?? 0).multipliedBy(HIGH_FEE_WARNING_MULTIPLIER),
                            ),
                        t('wallet_transfer_error_max_priority_gas_fee_too_high'),
                    ),
                maxFeePerGas: zod
                    .string()
                    .min(1, t('wallet_transfer_error_maxFee_absence'))
                    .refine(
                        (value) => new BigNumber(value).isGreaterThanOrEqualTo(gasNow?.slow ?? 0),
                        t('wallet_transfer_error_max_fee_too_low'),
                    )
                    .refine(
                        (value) =>
                            new BigNumber(value).isLessThan(
                                new BigNumber(gasNow?.fast ?? 0).multipliedBy(HIGH_FEE_WARNING_MULTIPLIER),
                            ),
                        t('wallet_transfer_error_max_fee_too_high'),
                    ),
            })
            .refine((data) => new BigNumber(data.maxPriorityFeePerGas).isLessThanOrEqualTo(data.maxFeePerGas), {
                message: t('wallet_transfer_error_max_priority_gas_fee_imbalance'),
                path: ['maxFeePerGas'],
            })
    }, [gas, gasNow])
    //#endregion

    const {
        control,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<zod.infer<typeof schema>>({
        mode: 'onChange',
        resolver: zodResolver(schema),
        defaultValues: {
            gasLimit: new BigNumber(gas).toString(),
            maxPriorityFeePerGas: '',
            maxFeePerGas: '0',
        },
        context: {
            gas,
            gasNow,
        },
    })

    useUpdateEffect(() => {
        if (
            value?.computedPayload?.type === EthereumRpcType.SEND_ETHER ||
            value?.computedPayload?.type === EthereumRpcType.CONTRACT_INTERACTION
        ) {
            // if rpc payload contain max fee and max priority fee, set them to default values
            if (value?.computedPayload._tx.maxFeePerGas && value?.computedPayload._tx.maxPriorityFeePerGas) {
                setValue('maxPriorityFeePerGas', value.computedPayload._tx.maxPriorityFeePerGas)
                setValue('maxFeePerGas', value.computedPayload._tx.maxFeePerGas)
            } else {
                setOption(1)
            }
        }
    }, [value, setValue])

    useUpdateEffect(() => {
        if (gas) setValue('gasLimit', new BigNumber(gas).toString())
    }, [gas, setValue])

    useEffect(() => {
        if (selected) {
            setValue('maxPriorityFeePerGas', options[selected].gasPrice ?? '')
            setValue('maxFeePerGas', options[selected].gasPrice ?? '')
        }
    }, [selected, setValue, options])

    const [{ loading }, handleConfirm] = useAsyncFn(
        async (data: zod.infer<typeof schema>) => {
            if (value) {
                const config = {
                    ...value.payload.params[0],
                    gas: data.gasLimit,
                    maxPriorityFeePerGas: new BigNumber(data.maxPriorityFeePerGas).toString(16),
                    maxFeePerGas: new BigNumber(data.maxFeePerGas).toString(16),
                }

                await WalletRPC.deleteUnconfirmedRequest(value.payload)

                await Services.Ethereum.confirmRequest({
                    ...value.payload,
                    params: [config, ...value.payload.params],
                })
                onConfirm?.()
            }
        },
        [value, onConfirm],
    )

    const onSubmit = handleSubmit((data) => handleConfirm(data))

    return (
        <>
            <div className={classes.options}>
                {options.map(({ title, gasPrice }, index) => (
                    <div
                        key={index}
                        onClick={() => setOption(index)}
                        className={selected === index ? classes.selected : undefined}>
                        <Typography className={classes.optionsTitle}>{title}</Typography>
                        <Typography>{new BigNumber(gasPrice ?? 0).toFixed(2)} Gwei</Typography>
                        <Typography className={classes.gasUSD}>
                            {t('popups_wallet_gas_fee_settings_usd', {
                                usd: new BigNumber(gasPrice ?? 0)
                                    .div(10 ** 9)
                                    .times(nativeTokenPrice)
                                    .toPrecision(3),
                            })}
                        </Typography>
                    </div>
                ))}
            </div>
            <Typography className={classes.or}>{t('popups_wallet_gas_fee_settings_or')}</Typography>
            <form onSubmit={onSubmit}>
                <Typography className={classes.label}>{t('popups_wallet_gas_fee_settings_gas_limit')}</Typography>
                <Controller
                    control={control}
                    render={({ field }) => {
                        return (
                            <StyledInput
                                {...field}
                                error={!!errors.gasLimit?.message}
                                helperText={errors.gasLimit?.message}
                                inputProps={{
                                    pattern: '^[0-9]*[.,]?[0-9]*$',
                                }}
                            />
                        )
                    }}
                    name="gasLimit"
                />
                <Typography className={classes.label}>
                    {t('popups_wallet_gas_fee_settings_max_priority_fee')}
                </Typography>
                <Controller
                    control={control}
                    render={({ field }) => (
                        <StyledInput
                            {...field}
                            error={!!errors.maxPriorityFeePerGas?.message}
                            helperText={errors.maxPriorityFeePerGas?.message}
                            inputProps={{
                                pattern: '^[0-9]*[.,]?[0-9]*$',
                            }}
                        />
                    )}
                    name="maxPriorityFeePerGas"
                />
                <Typography className={classes.label}>{t('popups_wallet_gas_fee_settings_max_fee')}</Typography>
                <Controller
                    control={control}
                    render={({ field }) => (
                        <StyledInput
                            {...field}
                            error={!!errors.maxFeePerGas?.message}
                            helperText={errors.maxFeePerGas?.message}
                            inputProps={{
                                pattern: '^[0-9]*[.,]?[0-9]*$',
                            }}
                        />
                    )}
                    name="maxFeePerGas"
                />
            </form>
            <LoadingButton
                loading={loading}
                variant="contained"
                fullWidth
                className={classes.button}
                disabled={!isEmpty(errors)}
                onClick={onSubmit}>
                {t('confirm')}
            </LoadingButton>
        </>
    )
})
