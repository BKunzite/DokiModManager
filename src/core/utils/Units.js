const MillisMap = {
    /**
     * 1000ms = 1s
     */
    SECOND: 1000,
    /**
     * 60,000ms = 1m
     */
    MINUTE: 60_000,
    /**
     * 3,600,000ms = 1h
     */
    HOUR: 3_600_000,
    /**
     * 86_400_000ms = 1day
     */
    DAY: 86_400_000
};
const ByteSizeMap = {
    /**
     * 1_048_600_000 bytes
     */
    GB: 1_048_600_000,
    /**
     * 1_048_600 bytes
     */
    MB: 1_048_600
}

export default {
    ByteSizeMap: ByteSizeMap,
    MillisMap: MillisMap
}